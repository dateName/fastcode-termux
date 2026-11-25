import { closeSync, constants as fsConstants, lstatSync, openSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { sandboxPath } from "../agent/tools/paths.js";
import { parsePatch } from "./parse.js";
import { countChangedLines, unifiedDiff } from "../lib/diff.js";
export function planPatch(patch, cwd) {
    const parsed = parsePatch(patch);
    if (parsed.ok === false)
        return { ok: false, output: parsed.output };
    const files = [];
    const warnings = [];
    for (const op of parsed.ops) {
        const planned = planOp(op, cwd, warnings);
        if (planned.ok === false)
            return { ok: false, output: planned.output };
        files.push(planned.file);
    }
    return { ok: true, plan: { files, warnings } };
}
function planOp(op, cwd, warnings) {
    try {
        const path = sandboxPath(cwd, op.path);
        if (op.kind === "add") {
            if (lexists(path))
                return { ok: false, output: `Add File target already exists: ${op.path}` };
            const newContent = op.lines.length > 0 ? op.lines.join("\n") + "\n" : "";
            return {
                ok: true,
                file: {
                    kind: "add",
                    relPath: op.path,
                    path,
                    existed: false,
                    origMode: 0o644,
                    eol: "\n",
                    newContent,
                    diff: makeDiff(null, op.path, "", newContent, "add"),
                    changedLines: newContent.split("\n").filter(Boolean).length,
                },
            };
        }
        if (!lexists(path))
            return { ok: false, output: `file not found: ${op.path}` };
        const info = lstatSync(path);
        if (info.isSymbolicLink())
            return { ok: false, output: `refusing to patch a symbolic link: ${op.path}` };
        if (!info.isFile())
            return { ok: false, output: `not a regular file: ${op.path}` };
        const oldContent = readNoFollow(path);
        if (op.kind === "delete") {
            return {
                ok: true,
                file: {
                    kind: "delete",
                    relPath: op.path,
                    path,
                    existed: true,
                    origMode: info.mode & 0o777,
                    eol: detectEol(oldContent),
                    oldContent,
                    diff: makeDiff(op.path, null, oldContent, "", "delete"),
                    changedLines: oldContent.split(/\r?\n/).length,
                },
            };
        }
        const eol = detectEol(oldContent);
        if (eol === "\n" && /\r\n/.test(oldContent))
            warnings.push(`mixed line endings in ${op.path}; writing LF`);
        let newContent = oldContent;
        if (op.hunks.length > 0) {
            const applied = applyHunks(oldContent, op.hunks);
            if (applied.ok === false)
                return applied;
            newContent = applied.content;
            if (eol === "\r\n")
                newContent = newContent.replace(/\n/g, "\r\n");
        }
        let moveTo;
        let moveRel;
        if (op.moveTo) {
            moveTo = sandboxPath(cwd, op.moveTo);
            if (lexists(moveTo))
                return { ok: false, output: `Move target already exists: ${op.moveTo}` };
            moveRel = op.moveTo;
        }
        const diff = makeDiff(op.path, op.moveTo ?? op.path, oldContent, newContent, "update");
        return {
            ok: true,
            file: {
                kind: "update",
                relPath: op.path,
                path,
                moveRel,
                moveTo,
                existed: true,
                origMode: info.mode & 0o777,
                eol,
                oldContent,
                newContent,
                diff,
                changedLines: countChangedLines(oldContent, newContent),
            },
        };
    }
    catch (err) {
        return { ok: false, output: err?.message ?? String(err) };
    }
}
export function reviewPatchPlan(plan) {
    let changed = 0;
    for (const file of plan.files) {
        changed += file.changedLines;
        if (isHardDenied(file.path))
            return { kind: "deny", reason: `patch targets a protected path: ${file.relPath}` };
        if (isSensitivePath(file.path))
            return { kind: "pending", reason: `patch targets a sensitive path: ${file.relPath}`, changedLines: changed };
    }
    if (changed > 200)
        return { kind: "pending", reason: `patch changes ${changed} lines (limit 200)`, changedLines: changed };
    return { kind: "allow" };
}
function isHardDenied(path) {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    const segments = normalized.split("/");
    if (segments.includes(".ssh") || segments.includes(".gnupg"))
        return true;
    if (normalized.includes("/.git/hooks/"))
        return true;
    if (normalized.includes("/android/data/"))
        return true;
    const name = basename(normalized);
    return name === "auth.json" || name === "trust.json";
}
function isSensitivePath(path) {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    const name = basename(normalized);
    return name === ".env" || name.startsWith(".env.") || /[.](pem|key|p12|pfx)$/.test(name) || normalized.includes("/.git/hooks/");
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
function readNoFollow(path) {
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    const fd = openSync(path, flags);
    try {
        return readFileSync(fd, "utf8");
    }
    finally {
        closeSync(fd);
    }
}
export function detectEol(content) {
    const crlf = (content.match(/\r\n/g) ?? []).length;
    const lf = (content.match(/\n/g) ?? []).length;
    return crlf > 0 && crlf === lf ? "\r\n" : "\n";
}
export function applyHunks(oldContent, hunks) {
    const lines = oldContent.split(/\r?\n/);
    let changed = false;
    for (const hunk of hunks) {
        const needle = hunk.lines.filter((line) => line.type !== "+").map((line) => line.text);
        const replacement = hunk.lines.filter((line) => line.type !== "-").map((line) => line.text);
        if (needle.length === 0) {
            const at = lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
            lines.splice(at, 0, ...replacement);
            changed = true;
            continue;
        }
        const verdict = findHunk(lines, needle);
        if (verdict.ok === false)
            return verdict;
        lines.splice(verdict.index, needle.length, ...replacement);
        changed = true;
    }
    if (!changed)
        return { ok: false, output: "patch made no changes" };
    return { ok: true, content: lines.join("\n") };
}
function findHunk(lines, needle) {
    for (let level = 0; level < 3; level += 1) {
        const matches = matchAll(lines, needle, level);
        if (matches.length === 0)
            continue;
        if (matches.length > 1) {
            return {
                ok: false,
                output: `ambiguous patch context (${matches.length} candidates at lines ${matches.map((index) => index + 1).join(", ")}); add surrounding context`,
            };
        }
        return { ok: true, index: matches[0] };
    }
    return { ok: false, output: `patch context not found: ${JSON.stringify(needle.slice(0, 4))}` };
}
function matchAll(lines, needle, level) {
    const found = [];
    const wanted = needle.map((line) => normalizeLine(line, level));
    for (let i = 0; i + needle.length <= lines.length; i += 1) {
        let match = true;
        for (let j = 0; j < needle.length; j += 1) {
            if (normalizeLine(lines[i + j], level) !== wanted[j]) {
                match = false;
                break;
            }
        }
        if (match)
            found.push(i);
    }
    return found;
}
function normalizeLine(line, level) {
    if (level === 0)
        return line;
    if (level === 1)
        return line.replace(/\s+$/, "");
    return line.replace(/\s+/g, " ").trim();
}
export function makeDiff(oldPath, newPath, oldContent, newContent, kind) {
    return unifiedDiff(oldPath, newPath, oldContent, newContent, kind);
}
