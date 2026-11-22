/**
 * Tiny i18n runtime: locale resolution + `t()` lookup with interpolation.
 *
 * This is a scaffold for user-facing UI strings, not for model prompts.
 * Resolution order:
 *   1. `setLocale()` override (programmatic, e.g. from a future `/lang`)
 *   2. `FASTCODE_LANG` environment variable
 *   3. `language` field in `~/.fastcode/config.json`
 *   4. `"en"`
 *
 * Unknown or region-tagged values (`zh-CN`, `en-US`) are reduced to their
 * base locale. Unsupported locales fall back to English.
 */
import { loadConfig } from "../config/store.js";
import { en } from "./catalog/en.js";
import { zh } from "./catalog/zh.js";
const CATALOGS = { en, zh };
let override;
let cached;
/** Reduce an arbitrary tag to a supported base locale, defaulting to English. */
export function normalizeLocale(input) {
    const value = String(input ?? "").trim().toLowerCase();
    if (!value)
        return "en";
    if (value.startsWith("zh"))
        return "zh";
    return "en";
}
function configuredLocale() {
    try {
        const config = loadConfig();
        return typeof config?.language === "string" ? config.language : undefined;
    }
    catch {
        return undefined;
    }
}
/** Effective locale for the current process. Resolved once and memoized. */
export function resolveLocale() {
    if (override)
        return override;
    if (cached)
        return cached;
    const env = process.env["FASTCODE_LANG"];
    cached = env && env.trim() ? normalizeLocale(env) : normalizeLocale(configuredLocale());
    return cached;
}
/** Force a locale for this process; pass `undefined` to fall back to auto-detect. */
export function setLocale(locale) {
    override = typeof locale === "string" && locale.trim() ? normalizeLocale(locale) : undefined;
    cached = undefined;
    return resolveLocale();
}
export function getLocale() {
    return resolveLocale();
}
/** Look up a message and fill `{name}` placeholders. */
export function t(key, vars) {
    const catalog = CATALOGS[resolveLocale()] ?? en;
    const template = catalog[key] ?? en[key] ?? key;
    if (!vars)
        return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
        const value = vars[name];
        return value === undefined ? match : String(value);
    });
}
