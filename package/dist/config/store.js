/**
 * Persistent config & auth store.
 *
 * We deliberately keep the format human-readable JSON so users on Termux can
 * edit it from `nano ~/.fastcode/config.json` if needed. Atomic writes prevent
 * partial files on Ctrl+C.
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
export function loadAuth() {
    const { auth } = getPaths();
    if (!existsSync(auth))
        return { keys: {} };
    try {
        const raw = JSON.parse(readFileSync(auth, "utf8"));
        return { keys: raw.keys ?? {} };
    }
    catch {
        return { keys: {} };
    }
}
export function saveAuth(store) {
    const { auth } = getPaths();
    atomicWrite(auth, JSON.stringify(store, null, 2));
    lockdown(auth);
}
/** Resolve an API key from auth store, then ENV. */
export function resolveApiKey(providerId, envVars) {
    const auth = loadAuth();
    if (auth.keys[providerId])
        return auth.keys[providerId];
    for (const envVar of envVars) {
        const v = process.env[envVar];
        if (v && v.trim())
            return v.trim();
    }
    return undefined;
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
