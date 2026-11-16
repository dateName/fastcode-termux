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
import type { MessageKey } from "./catalog/en.js";
import { zh } from "./catalog/zh.js";

export type { MessageKey };
export type Locale = "en" | "zh";

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, zh };

let override: Locale | undefined;
let cached: Locale | undefined;

/** Reduce an arbitrary tag to a supported base locale, defaulting to English. */
export function normalizeLocale(input: string | undefined | null): Locale {
    const value = (input ?? "").trim().toLowerCase();
    if (!value) return "en";
    if (value.startsWith("zh")) return "zh";
    return "en";
}

function configuredLocale(): string | undefined {
    try {
        const config = loadConfig() as { language?: string } | undefined;
        return config?.language;
    } catch {
        return undefined;
    }
}

/** Effective locale for the current process. Resolved once and memoized. */
export function resolveLocale(): Locale {
    if (override) return override;
    if (cached) return cached;
    const env = process.env["FASTCODE_LANG"];
    cached = env && env.trim() ? normalizeLocale(env) : normalizeLocale(configuredLocale());
    return cached;
}

/** Force a locale for this process; pass `undefined` to fall back to auto-detect. */
export function setLocale(locale: string | undefined): Locale {
    override = locale && locale.trim() ? normalizeLocale(locale) : undefined;
    cached = undefined;
    return resolveLocale();
}

export function getLocale(): Locale {
    return resolveLocale();
}

/** Look up a message and fill `{name}` placeholders. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
    const catalog = CATALOGS[resolveLocale()] ?? en;
    const template = catalog[key] ?? en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = vars[name];
        return value === undefined ? match : String(value);
    });
}
