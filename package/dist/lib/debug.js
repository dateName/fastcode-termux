/**
 * Minimal debug logging.
 *
 * There is no logging framework in this project: normal output goes through
 * Ink and lifecycle warnings go straight to stderr. `FASTCODE_DEBUG=1` opts
 * into low-volume stderr diagnostics (for example timeout clamping or config
 * cache invalidation) without changing the default experience.
 */
const TRUTHY = new Set(["1", "true", "yes", "on"]);
export function debugEnabled() {
    return TRUTHY.has((process.env["FASTCODE_DEBUG"] ?? "").trim().toLowerCase());
}
export function debugLog(scope, message) {
    if (!debugEnabled())
        return;
    try {
        process.stderr.write(`[fastcode:${scope}] ${message}\n`);
    }
    catch {
        // Debug logging must never break the operation it observes.
    }
}
