import { lstatSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { atomicFile } from "../lib/atomic-file.js";
import type { PatchPlan, PlannedFile } from "./plan.js";

export interface AppliedFile {
    path: string;
    kind: PlannedFile["kind"];
    diff: string;
}

export interface ApplyResult {
    ok: boolean;
    output: string;
    files: AppliedFile[];
    touched: string[];
    removed: string[];
    warnings: string[];
    atomic: boolean;
}

export async function applyPatchPlan(plan: PatchPlan): Promise<ApplyResult> {
    const warnings = [...plan.warnings];
    const applied: PlannedFile[] = [];
    const touched: string[] = [];
    const removed: string[] = [];
    let atomic = true;
    try {
        for (const file of plan.files) {
            if (!(await commit(file)))
                atomic = false;
            applied.push(file);
            if (file.kind === "delete") {
                removed.push(file.path);
            }
            else if (file.kind === "add") {
                touched.push(file.path);
            }
            else if (file.moveTo) {
                removed.push(file.path);
                touched.push(file.moveTo);
            }
            else {
                touched.push(file.path);
            }
        }
    }
    catch (err: any) {
        await rollback(applied, warnings);
        return {
            ok: false,
            output: `patch failed: ${err?.message ?? String(err)}; rolled back ${applied.length} file(s)`,
            files: [],
            touched: [],
            removed: [],
            warnings,
            atomic,
        };
    }
    const files = plan.files.map((file) => ({
        path: file.moveTo ?? file.path,
        kind: file.kind,
        diff: file.diff,
    }));
    return {
        ok: true,
        output: [`applied ${plan.files.length} file(s)`, ...files.map((file) => file.diff)].join("\n\n"),
        files,
        touched,
        removed,
        warnings,
        atomic,
    };
}

async function commit(file: PlannedFile): Promise<boolean> {
    if (file.kind === "delete") {
        rejectSymlink(file.path);
        unlinkSync(file.path);
        return true;
    }
    const target = file.moveTo ?? file.path;
    if (file.kind === "add" || file.moveTo) {
        if (lexists(target))
            throw new Error(`target already exists: ${target}`);
    }
    rejectSymlink(target, true);
    mkdirSync(dirname(target), { recursive: true });
    const staged = atomicFile.temp(target, { mode: file.origMode & 0o777 });
    let committedAtomic = true;
    try {
        await staged.write(file.newContent ?? "");
        committedAtomic = (await staged.commit()).atomic;
    }
    catch (err) {
        await staged.discard();
        throw err;
    }
    if (file.moveTo) {
        try {
            unlinkSync(file.path);
        }
        catch (err) {
            try {
                rmSync(target, { force: true });
            }
            catch {
                // best effort
            }
            throw err;
        }
    }
    return committedAtomic;
}

function rejectSymlink(path: string, allowMissing = false): void {
    try {
        if (lstatSync(path).isSymbolicLink())
            throw new Error(`refusing to write through a symbolic link: ${path}`);
    }
    catch (err: any) {
        if (err?.code === "ENOENT" && allowMissing)
            return;
        throw err;
    }
}

function lexists(path: string): boolean {
    try {
        lstatSync(path);
        return true;
    }
    catch {
        return false;
    }
}

async function rollback(applied: PlannedFile[], warnings: string[]): Promise<void> {
    for (let i = applied.length - 1; i >= 0; i -= 1) {
        const file = applied[i];
        try {
            if (file.kind === "add") {
                rmSync(file.path, { force: true });
                continue;
            }
            if (file.kind === "delete") {
                await restore(file.path, file.oldContent ?? "", file.origMode);
                continue;
            }
            if (file.moveTo) {
                rmSync(file.moveTo, { force: true });
                await restore(file.path, file.oldContent ?? "", file.origMode);
                continue;
            }
            await restore(file.path, file.oldContent ?? "", file.origMode);
        }
        catch (err: any) {
            warnings.push(`rollback failed for ${file.path}: ${err?.message ?? String(err)}`);
        }
    }
}

async function restore(path: string, content: string, mode: number): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    const staged = atomicFile.temp(path, { mode: mode & 0o777 });
    try {
        await staged.write(content);
        await staged.commit();
    }
    catch (err) {
        await staged.discard();
        throw err;
    }
}
