import { existsSync, lstatSync } from "node:fs";
import { stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { realpathOf } from "../../lib/realpath.js";
import { detectPlatform, safeHome } from "../../lib/platform.js";
import { loadConfig } from "../../config/store.js";
export { realpathOf } from "../../lib/realpath.js";
export function allowedRoots(cwd) {
    const roots = [resolve(cwd)];
    const configured = (process.env["FASTCODE_ALLOW_PATHS"] ?? "")
        .split(delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean);
    for (const entry of configured)
        roots.push(resolve(entry));
    const sharedDirs = loadConfig().sharedDirs;
    if (Array.isArray(sharedDirs)) {
        for (const entry of sharedDirs) {
            if (typeof entry !== "string" || !entry.trim())
                continue;
            roots.push(resolveSharedDir(cwd, entry.trim()));
        }
    }
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
export function resolveSharedDir(cwd, entry) {
    const expanded = entry === "~" || entry.startsWith("~/") || entry.startsWith("~\\")
        ? join(safeHome(), entry.slice(1))
        : entry;
    return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}
function isDisabled(value) {
    if (value === undefined)
        return false;
    return ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
export function isInsideAny(child, roots) {
    return roots.some((root) => {
        const rel = relative(root, child);
        return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    });
}
export function resolvePath(cwd, call, fallback = "") {
    const raw = typeof call.path === "string" ? call.path : fallback;
    return sandboxPath(cwd, raw);
}
export function sandboxPath(cwd, raw) {
    const target = resolve(cwd, raw);
    const roots = allowedRoots(cwd);
    const realRoots = roots.map((root) => realpathOf(root)).filter(Boolean);
    const realTarget = realpathOf(target);
    if (realTarget && isInsideAny(realTarget, realRoots))
        return target;
    throw new Error("path outside sandbox: " + raw);
}
/**
 * Resolve a write target through symlinks and return the real path that will be
 * written. A dangling symlink resolves to its (possibly outside) target, so it
 * is rejected instead of being mistaken for a missing in-sandbox path.
 */
export function sandboxWritePath(cwd, raw) {
    const target = resolve(cwd, raw);
    const roots = allowedRoots(cwd);
    const realRoots = roots.map((root) => realpathOf(root)).filter(Boolean);
    const realTarget = realpathOf(target);
    if (realTarget && isInsideAny(realTarget, realRoots))
        return realTarget;
    throw new Error("path outside sandbox: " + raw);
}
/** Reject a symlink at the final component before opening it for writing. */
export function assertNotSymlink(file) {
    try {
        if (lstatSync(file).isSymbolicLink())
            throw new Error("refusing to write through a symbolic link: " + file);
    }
    catch (err) {
        if (err?.code === "ENOENT")
            return;
        throw err;
    }
}
export async function existingMode(file) {
    try {
        return (await stat(file)).mode & 0o777;
    }
    catch {
        return undefined;
    }
}
