/**
 * Project trust store.
 *
 * Agent tools can read, write, delete and execute inside the workspace, so a
 * folder is only enabled after the user confirms it once. The list lives in
 * ~/.fastcode/trusted.json and is compared by real path.
 *
 * FASTCODE_TRUST_ALL=1 marks every directory trusted (scripts, CI).
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDir, getPaths } from "./paths.js";
const TRUTHY = ["1", "true", "yes", "on"];
export function normalizeProjectPath(dir) {
    const absolute = resolve(dir);
    try {
        return realpathSync(absolute);
    }
    catch {
        return absolute;
    }
}
export function loadTrust() {
    const { trust } = getPaths();
    if (!existsSync(trust))
        return { trusted: [] };
    try {
        const raw = JSON.parse(readFileSync(trust, "utf8"));
        return { trusted: Array.isArray(raw.trusted) ? raw.trusted.filter((entry) => entry && typeof entry.path === "string") : [] };
    }
    catch {
        return { trusted: [] };
    }
}
function saveTrust(state) {
    const paths = getPaths();
    ensureDir(paths.root);
    writeFileSync(paths.trust, JSON.stringify(state, null, 2), "utf8");
}
export function trustAllEnabled() {
    return TRUTHY.includes((process.env["FASTCODE_TRUST_ALL"] ?? "").trim().toLowerCase());
}
export function isTrusted(dir) {
    if (trustAllEnabled())
        return true;
    const target = normalizeProjectPath(dir);
    return loadTrust().trusted.some((entry) => entry.path === target);
}
export function trustProject(dir) {
    const target = normalizeProjectPath(dir);
    const state = loadTrust();
    if (!state.trusted.some((entry) => entry.path === target)) {
        state.trusted.push({ path: target, addedAt: new Date().toISOString() });
        saveTrust(state);
    }
    return target;
}
export function untrustProject(dir) {
    const target = normalizeProjectPath(dir);
    const state = loadTrust();
    const next = state.trusted.filter((entry) => entry.path !== target);
    saveTrust({ trusted: next });
    return state.trusted.length !== next.length;
}
export function listTrusted() {
    return loadTrust().trusted;
}
