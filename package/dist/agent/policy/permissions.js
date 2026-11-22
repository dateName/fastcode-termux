import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { globSafetyError, regexSafetyError } from "../../lib/glob.js";
import { isTrusted } from "../../config/trust.js";
import { loadConfig } from "../../config/store.js";
function strings(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim().length > 0) : [];
}
function normalizeLayer(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    return {
        shell: {
            allow: strings(raw.shell?.allow),
            deny: strings(raw.shell?.deny),
        },
    };
}
function mergeLayers(...layers) {
    const shell = { allow: [], deny: [] };
    for (const layer of layers) {
        shell.allow.push(...(layer.shell?.allow ?? []));
        shell.deny.push(...(layer.shell?.deny ?? []));
    }
    return { shell };
}
function readLayer(file) {
    try {
        if (!existsSync(file))
            return {};
        return normalizeLayer(JSON.parse(readFileSync(file, "utf8")));
    }
    catch {
        return {};
    }
}
/** Global config + trusted project/local .fastcode permission layers. */
export function loadPermissionPolicy(cwd = process.cwd()) {
    const global = normalizeLayer(loadConfig().permissions);
    if (!isTrusted(cwd))
        return mergeLayers(global);
    const root = resolve(cwd);
    return mergeLayers(global, readLayer(join(root, ".fastcode", "permissions.json")), readLayer(join(root, ".fastcode", "permissions.local.json")));
}
function patternMatcher(pattern) {
    const trimmed = pattern.trim();
    if (!trimmed)
        return undefined;
    const regex = /^\/(.+)\/([dgimsuvy]*)$/.exec(trimmed);
    if (regex) {
        const body = regex[1];
        const flags = regex[2];
        // Treat `/path/` and `/path/foo` as globs. Only an explicit flag set,
        // whitespace, or a regex metacharacter makes the body a regex.
        if (flags || /\s/.test(body) || /[.+^${}()|[\]\\]/.test(body)) {
            if (regexSafetyError(body))
                return undefined;
            try {
                return new RegExp(body, flags || "i");
            }
            catch {
                return undefined;
            }
        }
    }
    if (globSafetyError(trimmed))
        return undefined;
    const escaped = trimmed
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
    return new RegExp("^" + escaped + "$", "i");
}
function matchesAny(patterns, command) {
    for (const pattern of patterns ?? []) {
        const matcher = patternMatcher(pattern);
        if (matcher?.test(command))
            return true;
    }
    return false;
}
/** Deny wins over allow; no match means normal guard behavior. */
export function evaluateShellPermission(command, policy) {
    if (matchesAny(policy.shell?.deny, command))
        return "deny";
    if (matchesAny(policy.shell?.allow, command))
        return "allow";
    return "none";
}
