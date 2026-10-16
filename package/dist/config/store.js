/**
 * Persistent config & auth store.
 *
 * We deliberately keep the format human-readable JSON so users on Termux can
 * edit it from `nano ~/.fastcode/config.json` if needed. Atomic writes prevent
 * partial files on Ctrl+C.
 *
 * API keys are NOT a single global string: each one is scoped to a concrete
 * "provider + model" pair. auth.json stores one credential per
 * `<provider>::<model>` scope, and a stored key is only used when the current
 * provider AND model match that scope. The old provider-only format is read as
 * "legacy": it is shown back to the user but never used silently, because a
 * provider-only key does not tell us which model it was meant for.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
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
/** Composite scope id for a provider + model credential. */
export function scopeId(providerId, model) {
    return `${providerId}::${model}`;
}
export function loadAuth() {
    const { auth } = getPaths();
    const empty = { version: 2, keys: {}, legacy: {} };
    if (!existsSync(auth))
        return empty;
    try {
        const raw = JSON.parse(readFileSync(auth, "utf8"));
        const keys = {};
        const legacy = {};
        const source = raw && typeof raw === "object" ? (raw.keys ?? {}) : {};
        for (const [id, value] of Object.entries(source)) {
            if (value && typeof value === "object" && typeof value.key === "string") {
                const [idProvider, idModel] = id.split("::");
                const provider = value.provider || idProvider || id;
                const model = value.model || idModel || "";
                keys[scopeId(provider, model)] = {
                    provider,
                    model,
                    key: value.key,
                    addedAt: value.addedAt ?? "",
                };
            }
            else if (typeof value === "string" && value.trim()) {
                legacy[id] = value;
            }
        }
        if (raw && typeof raw === "object" && raw.legacy && typeof raw.legacy === "object") {
            for (const [id, value] of Object.entries(raw.legacy)) {
                if (typeof value === "string" && value.trim())
                    legacy[id] = value;
            }
        }
        return { version: 2, keys, legacy };
    }
    catch {
        return empty;
    }
}
export function saveAuth(store) {
    const { auth } = getPaths();
    const payload = { version: 2, keys: store.keys };
    if (Object.keys(store.legacy).length > 0)
        payload.legacy = store.legacy;
    atomicWrite(auth, JSON.stringify(payload, null, 2));
    lockdown(auth);
}
export function getCredential(providerId, model) {
    return loadAuth().keys[scopeId(providerId, model)];
}
export function listCredentials() {
    return Object.values(loadAuth().keys);
}
export function listLegacy() {
    return Object.entries(loadAuth().legacy).map(([provider, key]) => ({ provider, key }));
}
export function getLegacy(providerId) {
    return loadAuth().legacy[providerId];
}
/** Save/replace the credential for one provider+model scope (drops the legacy key). */
export function setCredential(providerId, model, key) {
    const store = loadAuth();
    const credential = {
        provider: providerId,
        model,
        key: key.trim(),
        addedAt: new Date().toISOString(),
    };
    store.keys[scopeId(providerId, model)] = credential;
    delete store.legacy[providerId];
    saveAuth(store);
    return credential;
}
export function removeCredential(providerId, model) {
    const store = loadAuth();
    const id = scopeId(providerId, model);
    if (!store.keys[id])
        return false;
    delete store.keys[id];
    saveAuth(store);
    return true;
}
/** Remove every credential for a provider (all models) plus its legacy key. */
export function removeCredentialsForProvider(providerId) {
    const store = loadAuth();
    let removed = 0;
    for (const id of Object.keys(store.keys)) {
        if (store.keys[id].provider === providerId) {
            delete store.keys[id];
            removed += 1;
        }
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
 * Resolve the key to use for a specific provider+model:
 *   1. the scoped credential in auth.json (exact provider+model match), then
 *   2. the provider's environment variable (provider-scoped, any model), and
 *   3. report an "unbound" legacy key instead of using it silently.
 */
export function resolveApiKey(providerId, model, envVars) {
    const store = loadAuth();
    const scoped = store.keys[scopeId(providerId, model)];
    if (scoped && scoped.key)
        return { status: "ok", key: scoped.key, source: "file" };
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
export function resolveProviderKey(providerId, envVars) {
    const store = loadAuth();
    for (const credential of Object.values(store.keys)) {
        if (credential.provider === providerId && credential.key)
            return { key: credential.key, source: "file" };
    }
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
