import { existsSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { detectPlatform, safeHome } from "../../lib/platform.js";
import { loadConfig } from "../../config/store.js";
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
    if (realTarget) {
        if (isInsideAny(realTarget, realRoots))
            return target;
        throw new Error("path outside sandbox: " + raw);
    }
    if (isInsideAny(target, roots))
        return target;
    throw new Error("path outside sandbox: " + raw);
}
export function realpathOf(input) {
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
