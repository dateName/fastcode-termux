import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { globSafetyError, regexSafetyError } from "../../lib/glob.js";
import { isTrusted } from "../../config/trust.js";
import { loadConfig } from "../../config/store.js";

export interface ShellPermissionRules {
    allow?: string[];
    deny?: string[];
}

export interface PermissionPolicy {
    shell?: ShellPermissionRules;
}

export type ShellPermissionDecision = "allow" | "deny" | "none";

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function normalizeLayer(raw: any): PermissionPolicy {
    if (!raw || typeof raw !== "object")
        return {};
    return {
        shell: {
            allow: strings(raw.shell?.allow),
            deny: strings(raw.shell?.deny),
        },
    };
}

function mergeLayers(...layers: PermissionPolicy[]): PermissionPolicy {
    const shell = { allow: [] as string[], deny: [] as string[] };
    for (const layer of layers) {
        shell.allow.push(...(layer.shell?.allow ?? []));
        shell.deny.push(...(layer.shell?.deny ?? []));
    }
    return { shell };
}

function isBroadProjectAllow(pattern: string): boolean {
    const value = pattern.trim();
    if (value === "*" || value === "**")
        return true;
    const match = /^\/(.*)\/([a-z]*)$/.exec(value);
    if (!match)
        return false;
    const body = match[1].replace(/^\^/, "").replace(/\$/, "");
    return body === ".*";
}

function readLayer(file: string): PermissionPolicy {
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
export function loadPermissionPolicy(cwd = process.cwd()): PermissionPolicy {
    const global = normalizeLayer(loadConfig().permissions);
    if (!isTrusted(cwd))
        return mergeLayers(global);
    const root = resolve(cwd);
    const project = mergeLayers(
        readLayer(join(root, ".fastcode", "permissions.json")),
        readLayer(join(root, ".fastcode", "permissions.local.json")),
    );
    // A trusted project must not silently become "allow everything" through
    // a catch-all pattern. Deny rules are kept as-is (deny is already fail-closed).
    const projectAllow = (project.shell?.allow ?? []).filter((pattern) => !isBroadProjectAllow(pattern));
    return mergeLayers(global, { shell: { allow: projectAllow, deny: project.shell?.deny ?? [] } });
}

function patternMatcher(pattern: string): RegExp | undefined {
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
                return new RegExp("^(?:" + body + ")$", flags || "i");
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
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/\u0000/g, ".*");
    return new RegExp("^" + escaped + "$", "i");
}

function matchesAny(patterns: string[] | undefined, command: string): boolean {
    for (const pattern of patterns ?? []) {
        const matcher = patternMatcher(pattern);
        if (matcher?.test(command))
            return true;
    }
    return false;
}

/** Deny wins over allow; no match means normal guard behavior. */
export function evaluateShellPermission(command: string, policy: PermissionPolicy): ShellPermissionDecision {
    if (matchesAny(policy.shell?.deny, command))
        return "deny";
    if (matchesAny(policy.shell?.allow, command))
        return "allow";
    return "none";
}
