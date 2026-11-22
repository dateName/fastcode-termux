import type { MessageKey } from "./catalog/en.js";
export type { MessageKey };
export type Locale = "en" | "zh";
/** Reduce an arbitrary tag to a supported base locale, defaulting to English. */
export declare function normalizeLocale(input: unknown): Locale;
/** Effective locale for the current process. Resolved once and memoized. */
export declare function resolveLocale(): Locale;
/** Force a locale for this process; pass `undefined` to fall back to auto-detect. */
export declare function setLocale(locale: unknown): Locale;
export declare function getLocale(): Locale;
/** Look up a message and fill `{name}` placeholders. */
export declare function t(key: MessageKey, vars?: Record<string, string | number>): string;
