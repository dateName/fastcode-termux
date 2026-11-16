/**
 * Simplified Chinese catalog.
 *
 * Typed as `Record<MessageKey, string>` so a missing or renamed key is a
 * compile-time error. Add new locales the same way and register them in
 * `src/i18n/index.ts`.
 */
import type { MessageKey } from "./en.js";
export declare const zh: Record<MessageKey, string>;
