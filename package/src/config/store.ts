/**
 * Persistent config & auth store.
 *
 * We deliberately keep the format human-readable JSON so users on Termux can
 * edit it from `nano ~/.fastcode/config.json` if needed. Atomic writes prevent
 * partial files on Ctrl+C.
 *
 * API keys are scoped to a provider, not to a model. auth.json stores one
 * credential per provider id, so switching between models of the same provider
 * reuses the same key. The old "provider::model" (v2) and provider-only (v1)
 * formats are read and migrated to the provider-scoped v3 layout on first load.
 */
import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { getPaths, lockdown, ensureDir } from "./paths.js";
import { DEFAULT_THEME } from "./themes.js";
export const DEFAULT_CONFIG = {
    providerId: "anthropic",
    model: "claude-sonnet-5.5",
    theme: DEFAULT_THEME,
    agentMode: true,
    systemPrompt: "You are FastCode, a fast, friendly coding assistant in a terminal UI. " +
        "Prefer concise responses. Use markdown when helpful (especially fenced " +
        "code blocks). When the user asks for code changes, output complete files " +
        "or unified diffs the user can apply.",
    enabledSkills: [],
    enabledPlugins: [],
    skillsRegistry: "https://skillshub.wtf",
    lifetimeCostUsd: 0,
    /**
     * Extra directories the file tools may read and write outside the project
     * root. Relative entries are resolved against the project root; `~/` is
     * expanded against the user's home directory.
     */
    sharedDirs: [],
    /** Maximum agent tool turns before the loop asks the user to continue. */
    maxAgentTurns: 24,
    /** Abort a stream that receives no data for this long (ms). */
    requestIdleTimeoutMs: 60_000,
    /** Approximate character budget before history compaction kicks in. */
    contextBudgetChars: 400_000,
    /** Thinking depth: auto = send nothing, provider default. */
    reasoningEffort: "auto",
    /** Cached per-provider/model capabilities (native vs pseudo tool calling). */
    capabilities: {
        toolCalling: {},
    },
};
export interface StoredCredential {
    provider: string;
    /** Model the key was originally saved for (display only; keys are provider-wide). */
    model?: string;
    key: string;
    addedAt: string;
}
export interface AuthStore {
    version: number;
    /** Provider-scoped credentials, keyed by provider id. */
    keys: Record<string, StoredCredential>;
    /** Old provider-only keys that could not be migrated (kept for diagnostics). */
    legacy: Record<string, string>;
}
export const AUTH_VERSION = 3;
export type KeyLookup = {
    status: "ok";
    key: string;
    source: "file" | "env";
    envVar?: string;
} | {
    status: "unbound";
    provider: string;
    legacyKey: string;
} | {
    status: "missing";
};
export function loadConfig() {
    const { config } = getPaths();
    if (!existsSync(config))
        return { ...DEFAULT_CONFIG };
    try {
        const raw = JSON.parse(readFileSync(config, "utf8"));
        return { ...DEFAULT_CONFIG, ...raw };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
export function saveConfig(cfg) {
    const { config } = getPaths();
    atomicWrite(config, JSON.stringify(cfg, null, 2));
}
/** Composite id used by the legacy v2 format; kept for API compatibility. */
export function scopeId(providerId, model) {
    return `${providerId}::${model}`;
}
/** Pick the most recently saved credential when several legacy scopes map to one provider. */
function keepNewest(keys, credential) {
    const existing = keys[credential.provider];
    if (!existing) {
        keys[credential.provider] = credential;
        return;
    }
    const previous = Date.parse(existing.addedAt || "") || 0;
    const next = Date.parse(credential.addedAt || "") || 0;
    if (next > previous)
        keys[credential.provider] = credential;
}
let migrationChecked = false;
export function loadAuth(): AuthStore {
    const { auth } = getPaths();
    const empty: AuthStore = { version: AUTH_VERSION, keys: {}, legacy: {} };
    if (!existsSync(auth))
        return empty;
    let raw: any;
    try {
        raw = JSON.parse(readFileSync(auth, "utf8"));
    }
    catch {
        return empty;
    }
    if (!raw || typeof raw !== "object")
        return empty;
    const keys: Record<string, StoredCredential> = {};
    const legacy: Record<string, string> = {};
    let migrated = false;
    const source = raw.keys && typeof raw.keys === "object" ? raw.keys : {};
    for (const [id, value] of Object.entries<any>(source)) {
        if (value && typeof value === "object" && typeof value.key === "string" && value.key.trim()) {
            const [idProvider, idModel] = id.split("::");
            const provider = typeof value.provider === "string" && value.provider ? value.provider : idProvider || id;
            const model = typeof value.model === "string" ? value.model : idModel || "";
            if (id.includes("::") || raw.version !== AUTH_VERSION)
                migrated = true;
            keepNewest(keys, {
                provider,
                model,
                key: value.key,
                addedAt: typeof value.addedAt === "string" ? value.addedAt : "",
            });
        }
        else if (typeof value === "string" && value.trim()) {
            // v1: keys were plain provider -> key strings.
            keepNewest(keys, { provider: id, key: value, addedAt: "" });
            migrated = true;
        }
    }
    if (raw.legacy && typeof raw.legacy === "object") {
        for (const [provider, value] of Object.entries<any>(raw.legacy)) {
            if (typeof value === "string" && value.trim()) {
                // Provider-only keys are exactly what v3 wants: migrate instead
                // of leaving them unusable.
                keepNewest(keys, { provider, key: value, addedAt: "" });
                migrated = true;
            }
        }
    }
    if (migrated && !migrationChecked) {
        try {
            // Keep the pre-migration file so a user with several old model
            // keys can recover a credential we had to collapse.
            const backup = auth + ".v2.bak";
            if (!existsSync(backup))
                copyFileSync(auth, backup);
            writeAuth({ version: AUTH_VERSION, keys, legacy });
        }
        catch {
            // Read-only home (or locked file): keep the migrated view in memory.
        }
    }
    migrationChecked = true;
    return { version: AUTH_VERSION, keys, legacy };
}
function writeAuth(store: AuthStore) {
    const { auth } = getPaths();
    atomicWrite(auth, JSON.stringify({ version: AUTH_VERSION, keys: store.keys }, null, 2));
    lockdown(auth);
}
export function saveAuth(store: AuthStore) {
    writeAuth(store);
}
export function getCredential(providerId, _model?): StoredCredential | undefined {
    return loadAuth().keys[providerId];
}
export function listCredentials(): StoredCredential[] {
    return Object.values(loadAuth().keys);
}
export function listLegacy(): Array<{
    provider: string;
    key: string;
}> {
    return Object.entries<any>(loadAuth().legacy).map(([provider, key]) => ({ provider, key }));
}
export function getLegacy(providerId): string | undefined {
    return loadAuth().legacy[providerId];
}
/** Save/replace the provider-wide credential (drops any legacy key). */
export function setCredential(providerId, model, key): StoredCredential {
    const store = loadAuth();
    const credential: StoredCredential = {
        provider: providerId,
        model,
        key: key.trim(),
        addedAt: new Date().toISOString(),
    };
    store.keys[providerId] = credential;
    delete store.legacy[providerId];
    saveAuth(store);
    return credential;
}
export function removeCredential(providerId, _model?): boolean {
    const store = loadAuth();
    if (!store.keys[providerId])
        return false;
    delete store.keys[providerId];
    saveAuth(store);
    return true;
}
/** Remove the provider-wide credential plus any legacy leftovers. */
export function removeCredentialsForProvider(providerId): number {
    const store = loadAuth();
    let removed = 0;
    if (store.keys[providerId]) {
        delete store.keys[providerId];
        removed += 1;
    }
    if (store.legacy[providerId]) {
        delete store.legacy[providerId];
        removed += 1;
    }
    if (removed > 0)
        saveAuth(store);
    return removed;
}
/** Turn a key into a safe terminal echo: `sk-****abcd`. */
export function maskKey(key) {
    const value = (key ?? "").trim();
    if (!value)
        return "";
    if (value.length <= 8)
        return "*".repeat(value.length);
    return value.slice(0, 3) + "****" + value.slice(-4);
}
/**
 * Resolve the key to use for a provider:
 *   1. the provider-wide credential in auth.json,
 *   2. the provider's environment variable (provider-scoped, any model), and
 *   3. a legacy provider-only key that somehow escaped migration.
 */
export function resolveApiKey(providerId, _model, envVars): KeyLookup {
    const store = loadAuth();
    const credential = store.keys[providerId];
    if (credential && credential.key)
        return { status: "ok", key: credential.key, source: "file" };
    for (const envVar of envVars ?? []) {
        const value = process.env[envVar];
        if (value && value.trim())
            return { status: "ok", key: value.trim(), source: "env", envVar };
    }
    if (store.legacy[providerId])
        return { status: "unbound", provider: providerId, legacyKey: store.legacy[providerId] };
    return { status: "missing" };
}
/** Best-effort key for a provider regardless of model (used to list models). */
export function resolveProviderKey(providerId, envVars): {
    key?: string;
    source?: "file" | "env";
    envVar?: string;
} {
    const store = loadAuth();
    const credential = store.keys[providerId];
    if (credential && credential.key)
        return { key: credential.key, source: "file" };
    for (const envVar of envVars ?? []) {
        const value = process.env[envVar];
        if (value && value.trim())
            return { key: value.trim(), source: "env", envVar };
    }
    return {};
}
/**
 * Write-then-rename so a Ctrl+C mid-write never leaves a corrupt file.
 *
 * The temp file MUST live in the same directory as the target so the rename
 * is a same-filesystem operation. On many Linux distros `/tmp` is a tmpfs
 * mount, which would make `renameSync` throw EXDEV across filesystems.
 */
function atomicWrite(target, contents) {
    const dir = dirname(target);
    ensureDir(dir);
    const tmp = join(dir, `.fastcode-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(tmp, contents, { encoding: "utf8" });
    renameSync(tmp, target);
}
