/**
 * Project trust store.
 *
 * Agent tools can read, write, delete and execute inside the workspace, so a
 * folder is only enabled after the user confirms it once. The list lives in
 * ~/.fastcode/trusted.json and is compared by real path.
 *
 * FASTCODE_TRUST_ALL=1 marks every directory trusted (scripts, CI).
 */
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDir, getPaths } from "./paths.js";

const TRUTHY = ["1", "true", "yes", "on"];

export interface TrustPathEntry {
    grantedAt: string;
    lastUsed: string;
}

export interface TrustToolEntry extends TrustPathEntry {
    catalogHash: string;
}

export interface TrustStore {
    version: 1;
    tools: Record<string, TrustToolEntry>;
    paths: Record<string, TrustPathEntry>;
}

let cache: { file: string; key: string; state: TrustStore } | undefined;

export function normalizeProjectPath(dir: string): string {
    const absolute = resolve(dir);
    try {
        return realpathSync(absolute);
    }
    catch {
        return absolute;
    }
}

function emptyStore(): TrustStore {
    return { version: 1, tools: {}, paths: {} };
}

function normalizePaths(raw: any): Record<string, TrustPathEntry> {
    const paths: Record<string, TrustPathEntry> = {};
    if (!raw || typeof raw !== "object")
        return paths;
    for (const [key, value] of Object.entries<any>(raw)) {
        if (!key || !value || typeof value !== "object")
            continue;
        paths[key] = {
            grantedAt: typeof value.grantedAt === "string" ? value.grantedAt : "",
            lastUsed: typeof value.lastUsed === "string" ? value.lastUsed : "",
        };
    }
    return paths;
}

function normalizeTools(raw: any): Record<string, TrustToolEntry> {
    const tools: Record<string, TrustToolEntry> = {};
    if (!raw || typeof raw !== "object")
        return tools;
    for (const [key, value] of Object.entries<any>(raw)) {
        if (!key || !value || typeof value !== "object" || typeof value.catalogHash !== "string")
            continue;
        tools[key] = {
            grantedAt: typeof value.grantedAt === "string" ? value.grantedAt : "",
            lastUsed: typeof value.lastUsed === "string" ? value.lastUsed : "",
            catalogHash: value.catalogHash,
        };
    }
    return tools;
}

function migrateLegacy(raw: any): TrustStore | undefined {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.trusted))
        return undefined;
    const store = emptyStore();
    for (const entry of raw.trusted) {
        if (!entry || typeof entry.path !== "string" || !entry.path)
            continue;
        const at = typeof entry.addedAt === "string" ? entry.addedAt : new Date().toISOString();
        store.paths[entry.path] = { grantedAt: at, lastUsed: at };
    }
    return store;
}

function readStore(file: string): TrustStore {
    if (!existsSync(file))
        return emptyStore();
    try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        if (raw && raw.version === 1) {
            return {
                version: 1,
                tools: normalizeTools(raw.tools),
                paths: normalizePaths(raw.paths),
            };
        }
        const migrated = migrateLegacy(raw);
        if (!migrated)
            return emptyStore();
        try {
            writeFileSync(file, JSON.stringify(migrated, null, 2), "utf8");
        }
        catch {
            // A read-only home still gets the migrated view in memory.
        }
        return migrated;
    }
    catch {
        return emptyStore();
    }
}

export function loadTrust(): TrustStore {
    const { trust } = getPaths();
    let key = "missing";
    try {
        const info = statSync(trust);
        key = `${info.mtimeMs}:${info.size}`;
    }
    catch {
        // Missing file: cache the empty store until it appears.
    }
    if (cache && cache.file === trust && cache.key === key)
        return cache.state;
    const state = readStore(trust);
    cache = { file: trust, key, state };
    return state;
}

function saveTrust(state: TrustStore): void {
    const paths = getPaths();
    ensureDir(paths.root);
    writeFileSync(paths.trust, JSON.stringify(state, null, 2), "utf8");
    try {
        const info = statSync(paths.trust);
        cache = { file: paths.trust, key: `${info.mtimeMs}:${info.size}`, state };
    }
    catch {
        cache = undefined;
    }
}

export function trustAllEnabled(): boolean {
    return TRUTHY.includes((process.env["FASTCODE_TRUST_ALL"] ?? "").trim().toLowerCase());
}

export function isTrusted(dir: string): boolean {
    if (trustAllEnabled())
        return true;
    const target = normalizeProjectPath(dir);
    return Boolean(loadTrust().paths[target]);
}

export function trustProject(dir: string): string {
    const target = normalizeProjectPath(dir);
    const state = loadTrust();
    if (!state.paths[target]) {
        const at = new Date().toISOString();
        state.paths[target] = { grantedAt: at, lastUsed: at };
        saveTrust(state);
    }
    return target;
}

export function untrustProject(dir: string): boolean {
    const target = normalizeProjectPath(dir);
    const state = loadTrust();
    if (!state.paths[target])
        return false;
    delete state.paths[target];
    saveTrust(state);
    return true;
}

export function listTrusted(): Array<{ path: string; addedAt: string }> {
    return Object.entries(loadTrust().paths).map(([path, entry]) => ({ path, addedAt: entry.grantedAt }));
}
