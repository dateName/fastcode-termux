import { debugLog } from "../../lib/debug.js";
import { sandboxPath } from "./paths.js";
export function invalid(output) {
    return { ok: false, output };
}
export function requiredString(call, key) {
    const value = call[key];
    if (typeof value !== "string")
        throw new Error(`${key} must be a string`);
    return value;
}
export function stringArray(call, key) {
    const value = call[key];
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error(`${key} must be an array of strings`);
    }
    return value;
}
export function numberOption(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export const MAX_TIMEOUT_MS = 2147483647;
/**
 * Normalize a tool `timeoutMs` value.
 *
 * Only `null`/`undefined` mean "not specified". Any other non-number, NaN,
 * Infinity, or negative value is a caller error and must be surfaced instead
 * of silently falling back. Large finite values are clamped to the
 * `setTimeout` ceiling (2^31-1) rather than overflowing to 1ms.
 */
export function normalizeTimeoutMs(value, fallback = 120000) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== "number") {
        throw new TypeError(`timeoutMs must be a finite number; received ${describeValue(value)}`);
    }
    if (!Number.isFinite(value)) {
        throw new TypeError(`timeoutMs must be a finite number; received ${describeValue(value)}`);
    }
    if (value < 0) {
        throw new TypeError(`timeoutMs must not be negative; received ${describeValue(value)}`);
    }
    const floored = Math.floor(value);
    const clamped = Math.min(floored, MAX_TIMEOUT_MS);
    if (clamped !== floored)
        debugLog("timeout", `timeoutMs ${value} clamped to ${clamped}`);
    return clamped;
}
function describeValue(value) {
    if (typeof value === "string")
        return `string ${JSON.stringify(value)}`;
    if (typeof value === "number")
        return String(value);
    if (typeof value === "bigint")
        return `bigint ${value}n`;
    if (typeof value === "object" && value !== null) {
        try {
            return `object ${JSON.stringify(value)}`;
        }
        catch {
            return "object";
        }
    }
    return String(value);
}
export function preparePath(cwd, raw) {
    try {
        sandboxPath(cwd, raw);
        return { ok: true };
    }
    catch (err) {
        return invalid(err?.message ?? String(err));
    }
}
