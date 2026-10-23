import { closeSync, constants as fsConstants, fchmodSync, lstatSync, mkdirSync, openSync, renameSync, rmSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
export function applyPatchPlan(plan) {
    const warnings = [...plan.warnings];
    const applied = [];
    const touched = [];
    const removed = [];
    const temps = [];
    try {
        for (const file of plan.files) {
            commit(file, warnings, temps);
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
    catch (err) {
        for (const tmp of temps) {
            try {
                rmSync(tmp, { force: true });
            }
            catch {
                // best effort
            }
        }
        rollback(applied, warnings);
        return {
            ok: false,
            output: `patch failed: ${err?.message ?? String(err)}; rolled back ${applied.length} file(s)`,
            files: [],
            touched: [],
            removed: [],
            warnings,
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
    };
}
function commit(file, warnings, temps) {
    if (file.kind === "delete") {
        rejectSymlink(file.path);
        unlinkSync(file.path);
        return;
    }
    const target = file.moveTo ?? file.path;
    if (file.kind === "add" || file.moveTo) {
        if (lexists(target))
            throw new Error(`target already exists: ${target}`);
    }
    rejectSymlink(target, true);
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.fastcode-patch-${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    temps.push(tmp);
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0);
    const fd = openSync(tmp, flags, 0o600);
    try {
        writeSync(fd, file.newContent ?? "");
        try {
            fchmodSync(fd, file.origMode & 0o777);
        }
        catch {
            warnings.push(`could not restore mode ${(file.origMode & 0o777).toString(8)} on ${target}; check permissions`);
        }
    }
    finally {
        closeSync(fd);
    }
    rejectSymlink(target, true);
    renameSync(tmp, target);
    const index = temps.indexOf(tmp);
    if (index >= 0)
        temps.splice(index, 1);
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
}
function rejectSymlink(path, allowMissing = false) {
    try {
        if (lstatSync(path).isSymbolicLink())
            throw new Error(`refusing to write through a symbolic link: ${path}`);
    }
    catch (err) {
        if (err?.code === "ENOENT" && allowMissing)
            return;
        throw err;
    }
}
function lexists(path) {
    try {
        lstatSync(path);
        return true;
    }
    catch {
        return false;
    }
}
function rollback(applied, warnings) {
    for (let i = applied.length - 1; i >= 0; i -= 1) {
        const file = applied[i];
        try {
            if (file.kind === "add") {
                rmSync(file.path, { force: true });
                continue;
            }
            if (file.kind === "delete") {
                restore(file.path, file.oldContent ?? "", file.origMode);
                continue;
            }
            if (file.moveTo) {
                rmSync(file.moveTo, { force: true });
                restore(file.path, file.oldContent ?? "", file.origMode);
                continue;
            }
            restore(file.path, file.oldContent ?? "", file.origMode);
        }
        catch (err) {
            warnings.push(`rollback failed for ${file.path}: ${err?.message ?? String(err)}`);
        }
    }
}
function restore(path, content, mode) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.fastcode-restore-${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0);
    const fd = openSync(tmp, flags, 0o600);
    try {
        writeSync(fd, content);
        try {
            fchmodSync(fd, mode & 0o777);
        }
        catch {
            // best effort during rollback
        }
    }
    finally {
        closeSync(fd);
    }
    renameSync(tmp, path);
}
