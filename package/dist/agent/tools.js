import { spawn } from "node:child_process";
import { appendFile, copyFile, mkdir, readdir, readFile, realpath, rm, rename, stat, writeFile, } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { detectPlatform } from "../lib/platform.js";
import { evaluateShellCommand } from "./guards.js";
import { createOutputBuffer } from "./limits.js";
export async function runAgentTool(call, cwd = process.cwd()) {
    const sandbox = resolve(cwd);
    try {
        switch (call.tool) {
            case "shell":
                return await runShell(requiredString(call, "command"), sandbox, numberOption(call.timeoutMs, 120000));
            case "pwd":
                return { ok: true, output: sandbox };
            case "read_file":
                return { ok: true, output: await readFile(resolvePath(sandbox, call), "utf8") };
            case "read_many":
                return { ok: true, output: await readMany(sandbox, stringArray(call, "paths")) };
            case "write_file": {
                const file = resolvePath(sandbox, call);
                await mkdir(dirname(file), { recursive: true });
                await writeFile(file, requiredString(call, "content"), "utf8");
                return { ok: true, output: `wrote ${file}` };
            }
            case "append_file": {
                const file = resolvePath(sandbox, call);
                await mkdir(dirname(file), { recursive: true });
                await appendFile(file, requiredString(call, "content"), "utf8");
                return { ok: true, output: `appended ${file}` };
            }
            case "apply_patch":
                return await applyPatch(sandbox, requiredString(call, "patch"));
            case "copy_file": {
                const from = sandboxPath(sandbox, requiredString(call, "from"));
                const to = sandboxPath(sandbox, requiredString(call, "to"));
                await mkdir(dirname(to), { recursive: true });
                await copyFile(from, to);
                return { ok: true, output: `copied ${from} to ${to}` };
            }
            case "delete_file": {
                const file = resolvePath(sandbox, call);
                await rm(file, { recursive: true, force: true });
                return { ok: true, output: `deleted ${file}` };
            }
            case "list_files":
                return { ok: true, output: await listFiles(sandbox, resolvePath(sandbox, call, "."), numberOption(call.maxDepth, 2)) };
            case "make_dir": {
                const dir = resolvePath(sandbox, call);
                await mkdir(dir, { recursive: true });
                return { ok: true, output: `created ${dir}` };
            }
            case "move_path": {
                const from = sandboxPath(sandbox, requiredString(call, "from"));
                const to = sandboxPath(sandbox, requiredString(call, "to"));
                await mkdir(dirname(to), { recursive: true });
                await rename(from, to);
                return { ok: true, output: `moved ${from} to ${to}` };
            }
            case "grep":
                return {
                    ok: true,
                    output: await grepFiles(sandbox, resolvePath(sandbox, call, "."), requiredString(call, "pattern"), numberOption(call.maxDepth, 4)),
                };
            case "replace_in_file": {
                const file = resolvePath(sandbox, call);
                const find = requiredString(call, "find");
                const replacement = requiredString(call, "replace");
                const source = await readFile(file, "utf8");
                if (!source.includes(find))
                    return { ok: false, output: `text not found in ${file}` };
                await writeFile(file, source.split(find).join(replacement), "utf8");
                return { ok: true, output: `replaced text in ${file}` };
            }
            case "stat_path": {
                const file = resolvePath(sandbox, call);
                const info = await stat(file);
                return {
                    ok: true,
                    output: JSON.stringify({
                        path: file,
                        type: info.isDirectory() ? "dir" : info.isFile() ? "file" : "other",
                        size: info.size,
                        modified: info.mtime.toISOString(),
                    }, null, 2),
                };
            }
            default:
                return { ok: false, output: `unknown tool: ${String(call.tool)}` };
        }
    }
    catch (err) {
        return { ok: false, output: err.message };
    }
}
async function runShell(command, cwd, timeoutMs) {
    const verdict = evaluateShellCommand(command);
    if (!verdict.allow)
        return { ok: false, output: verdict.output };
    return await new Promise((resolvePromise) => {
        const child = spawn(command, {
            cwd,
            shell: true,
            env: { ...process.env, FASTCODE_SANDBOX: "1", FASTCODE_SANDBOX_ROOT: cwd },
            windowsHide: true,
        });
        const timeout = setTimeout(() => {
            child.kill("SIGTERM");
            resolvePromise({ ok: false, output: `command timed out after ${timeoutMs}ms\n${output.trimEnd()}` });
        }, timeoutMs);
        const output = createOutputBuffer(undefined, "tail");
        const collect = (chunk) => {
            output.push(chunk.toString("utf8"));
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        child.on("error", (err) => {
            clearTimeout(timeout);
            resolvePromise({ ok: false, output: err.message });
        });
        child.on("close", (code) => {
            clearTimeout(timeout);
            resolvePromise({
                ok: code === 0,
                output: output.trimEnd(),
            });
        });
    });
}
async function readMany(cwd, paths) {
    const blocks = [];
    for (const path of paths) {
        const file = sandboxPath(cwd, path);
        blocks.push(`### ${file}\n${await readFile(file, "utf8")}`);
    }
    return blocks.join("\n\n");
}
async function listFiles(sandbox, root, maxDepth) {
    const out = createOutputBuffer();
    await walkWithin(sandbox, root, maxDepth, async (file, info) => {
        out.line((info.isDirectory() ? "dir " : "file") + " " + file);
        return !out.full;
    });
    return out.value();
}
async function grepFiles(sandbox, root, pattern, maxDepth) {
    const re = new RegExp(pattern, "i");
    const out = createOutputBuffer();
    await walkWithin(sandbox, root, maxDepth, async (file, info) => {
        if (!info.isFile())
            return;
        try {
            const text = await readFile(file, "utf8");
            const lines = text.split(/\r?\n/);
            lines.forEach((line, index) => {
                if (re.test(line))
                    out.line(file + ":" + (index + 1) + ": " + line);
            });
        }
        catch {
            // Binary or unreadable files are skipped.
        }
        return !out.full;
    });
    return out.value();
}
/** Start a walk bounded to the sandbox plus every allowed extra root. */
async function walkWithin(sandbox, root, maxDepth, visit) {
    const roots = allowedRoots(sandbox).map((entry) => realpathOf(entry)).filter(Boolean);
    await walk(root, maxDepth, visit, 0, { roots, visited: 0, maxVisited: 5000 }, []);
}
/**
 * Tolerant recursive walk.
 *
 * stat() follows symlinks, so a dangling link (common on Termux: after
 * termux-setup-storage the ~/storage/* links break once the phone-side folder
 * is deleted) throws ENOENT. One bad entry must never abort the whole walk, so
 * every stat/readdir/visit is guarded individually.
 *
 * Valid symlinks are followed. Recursion stops only where the real target is
 * outside every allowed root: the sandbox, FASTCODE_ALLOW_PATHS, and on Termux
 * ~/storage/shared (allowed by default). A per-branch chain of real paths breaks
 * symlink cycles (loop -> ancestor) without hiding legitimate sibling symlinks.
 */
async function walk(node, maxDepth, visit, depth = 0, state, chain = []) {
    if (state.visited >= state.maxVisited)
        return;
    let info;
    try {
        info = await stat(node);
    }
    catch {
        return; // dangling symlink or unreadable entry: skip it, keep going
    }
    let real;
    try {
        real = await realpath(node);
    }
    catch {
        real = node;
    }
    if (chain.includes(real))
        return;
    state.visited += 1;
    const insideSandbox = !state.roots || state.roots.length === 0 || isInsideAny(real, state.roots);
    let keepGoing = true;
    try {
        keepGoing = (await visit(node, info)) !== false;
    }
    catch {
        // A visitor failure must not abort the surrounding walk.
    }
    if (!keepGoing)
        return false;
    if (!info.isDirectory() || depth >= maxDepth || !insideSandbox)
        return;
    let entries;
    try {
        entries = await readdir(node, { withFileTypes: true });
    }
    catch {
        return;
    }
    const nextChain = chain.concat(real);
    for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist")
            continue;
        if (state.visited >= state.maxVisited)
            return;
        try {
            const keepWalking = await walk(join(node, entry.name), maxDepth, visit, depth + 1, state, nextChain);
            if (keepWalking === false)
                return false;
        }
        catch {
            // Keep walking siblings.
        }
    }
}
/**
 * Roots the agent may touch: the sandbox (cwd) plus configured extras.
 *
 * Termux users keep projects and downloads in shared storage, so on Termux
 * ~/storage/shared (-> /storage/emulated/0) is allowed by default.
 *
 *   FASTCODE_ALLOW_PATHS=/sdcard/projects:/sdcard/Download   extra roots
 *   FASTCODE_ALLOW_SHARED_STORAGE=0                          disable the default
 */
function allowedRoots(cwd) {
    const roots = [resolve(cwd)];
    const configured = (process.env["FASTCODE_ALLOW_PATHS"] ?? "")
        .split(delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean);
    for (const entry of configured)
        roots.push(resolve(entry));
    if (detectPlatform() === "termux" && !isDisabled(process.env["FASTCODE_ALLOW_SHARED_STORAGE"])) {
        const home = process.env["HOME"];
        if (home) {
            const shared = join(home, "storage", "shared");
            if (existsSync(shared))
                roots.push(shared);
        }
    }
    return roots;
}
function isDisabled(value) {
    if (value === undefined)
        return false;
    return ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
function isInsideAny(child, roots) {
    return roots.some((root) => {
        const rel = relative(root, child);
        return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    });
}
function resolvePath(cwd, call, fallback = "") {
    const raw = typeof call.path === "string" ? call.path : fallback;
    return sandboxPath(cwd, raw);
}
function sandboxPath(cwd, raw) {
    const target = resolve(cwd, raw);
    const roots = allowedRoots(cwd);
    // Real-path containment is authoritative: it is the only check that sees
    // through symlinks, so a link planted inside the sandbox cannot escape.
    const realRoots = roots.map((root) => realpathOf(root)).filter(Boolean);
    const realTarget = realpathOf(target);
    if (realTarget) {
        if (isInsideAny(realTarget, realRoots))
            return target;
        throw new Error("path outside sandbox: " + raw);
    }
    // realpathOf() returns undefined only when nothing on the chain exists yet,
    // so a lexical check against the configured roots is safe here.
    if (isInsideAny(target, roots))
        return target;
    throw new Error("path outside sandbox: " + raw);
}
/** Resolve a path that may not exist yet by realpath-ing its deepest existing ancestor. */
function realpathOf(input) {
    let current = resolve(input);
    const missing = [];
    for (;;) {
        if (existsSync(current)) {
            try {
                return join(realpathSync(current), ...missing.slice().reverse());
            }
            catch {
                return undefined;
            }
        }
        const parent = dirname(current);
        if (parent === current)
            return undefined;
        missing.push(basename(current));
        current = parent;
    }
}
function requiredString(call, key) {
    const value = call[key];
    if (typeof value !== "string")
        throw new Error(`${key} must be a string`);
    return value;
}
function stringArray(call, key) {
    const value = call[key];
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error(`${key} must be an array of strings`);
    }
    return value;
}
function numberOption(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
async function applyPatch(cwd, patch) {
    const lines = patch.split(/\r?\n/);
    if (lines[0] !== "*** Begin Patch")
        return { ok: false, output: "patch must start with *** Begin Patch" };
    let i = 1;
    let changed = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line === "*** End Patch" || line === "")
            break;
        if (!line?.startsWith("*** Update File: ")) {
            return { ok: false, output: `unsupported patch directive: ${line ?? ""}` };
        }
        const relative = line.slice("*** Update File: ".length).trim();
        const file = resolve(cwd, relative);
        let source = await readFile(file, "utf8");
        i += 1;
        while (i < lines.length && !lines[i]?.startsWith("*** ")) {
            if (lines[i] === "@@")
                i += 1;
            const remove = [];
            const add = [];
            while (i < lines.length && lines[i] !== "@@" && !lines[i]?.startsWith("*** ")) {
                const hunkLine = lines[i] ?? "";
                if (hunkLine.startsWith("-"))
                    remove.push(hunkLine.slice(1));
                if (hunkLine.startsWith("+"))
                    add.push(hunkLine.slice(1));
                i += 1;
            }
            const needle = `${remove.join("\n")}${remove.length > 0 ? "\n" : ""}`;
            const replacement = `${add.join("\n")}${add.length > 0 ? "\n" : ""}`;
            if (needle && !source.includes(needle)) {
                return { ok: false, output: `patch context not found in ${file}: ${JSON.stringify(needle)}` };
            }
            source = needle ? source.replace(needle, replacement) : source + replacement;
            changed += 1;
        }
        await writeFile(file, source, "utf8");
    }
    return { ok: true, output: `applied ${changed} patch hunk(s)` };
}
