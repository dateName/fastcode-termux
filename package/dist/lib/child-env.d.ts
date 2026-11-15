/**
 * Child-process environment and log redaction.
 *
 * External CLIs must not inherit the whole host environment: `auth.json`
 * credentials, proxy tokens and unrelated secrets would leak into a process we
 * do not control. Callers pass an explicit allowlist (plus their own extras),
 * and diagnostics redact the common credential shapes before showing stderr.
 */
/** Variables a spawned CLI almost always needs to find its own runtime. */
export declare const MANDATORY_CHILD_ENV: readonly ["PATH", "HOME", "USERPROFILE", "SystemRoot", "ComSpec", "PATHEXT", "TMPDIR", "TEMP", "TMP"];
/** Conservative defaults: locale/terminal identity plus the runtime paths. */
export declare const DEFAULT_CHILD_ENV_ALLOWLIST: readonly ["PATH", "HOME", "USERPROFILE", "SystemRoot", "ComSpec", "PATHEXT", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "SHELL", "USER", "LOGNAME", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"];
export type ChildEnv = Record<string, string>;
/**
 * Build a child environment from an allowlist.
 *
 * Semantics:
 * - only names in `allowlist` (or `MANDATORY_CHILD_ENV`) are copied from the
 *   host, so an unlisted secret is absent rather than merely unused;
 * - `extra` is applied last and is the explicit injection channel;
 * - an empty value is preserved only when the caller supplied it explicitly.
 */
export declare function buildChildEnv(allowlist?: readonly string[], extra?: Record<string, string | undefined>): ChildEnv;
/**
 * Remove terminal escapes and the credential shapes a CLI may print at
 * startup. This is for error tails and diagnostics, not for transcripts.
 */
export declare function redactSecrets(text: string): string;
