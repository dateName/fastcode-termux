/**
 * Child-process environment and log redaction.
 *
 * External CLIs must not inherit the whole host environment: `auth.json`
 * credentials, proxy tokens and unrelated secrets would leak into a process we
 * do not control. Callers pass an explicit allowlist (plus their own extras),
 * and diagnostics redact the common credential shapes before showing stderr.
 */
/** Variables a spawned CLI almost always needs to find its own runtime. */
export const MANDATORY_CHILD_ENV = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "ComSpec",
    "PATHEXT",
    "TMPDIR",
    "TEMP",
    "TMP",
];
/** Conservative defaults: locale/terminal identity plus the runtime paths. */
export const DEFAULT_CHILD_ENV_ALLOWLIST = [
    ...MANDATORY_CHILD_ENV,
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "SHELL",
    "USER",
    "LOGNAME",
    "XDG_RUNTIME_DIR",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
];
/**
 * Build a child environment from an allowlist.
 *
 * Semantics:
 * - only names in `allowlist` (or `MANDATORY_CHILD_ENV`) are copied from the
 *   host, so an unlisted secret is absent rather than merely unused;
 * - `extra` is applied last and is the explicit injection channel;
 * - an empty value is preserved only when the caller supplied it explicitly.
 */
export function buildChildEnv(allowlist = DEFAULT_CHILD_ENV_ALLOWLIST, extra = {}) {
    const names = new Set([...MANDATORY_CHILD_ENV, ...allowlist]);
    const env = {};
    for (const name of names) {
        const value = process.env[name];
        if (value !== undefined)
            env[name] = value;
    }
    for (const [name, value] of Object.entries(extra)) {
        if (value !== undefined)
            env[name] = value;
    }
    return env;
}
const ANSI_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
/**
 * Remove terminal escapes and the credential shapes a CLI may print at
 * startup. This is for error tails and diagnostics, not for transcripts.
 */
export function redactSecrets(text) {
    return String(text)
        .replace(ANSI_CSI, "")
        .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
        .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]")
        .replace(/\b(api[_-]?key|authorization|x-api-key|access[_-]?token|refresh[_-]?token|token|secret|password)(\s*[:=]\s*)(["']?)[^\s"',;]+/gi, "$1$2$3[REDACTED]");
}
