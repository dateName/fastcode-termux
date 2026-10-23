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
export function preparePath(cwd, raw) {
    try {
        sandboxPath(cwd, raw);
        return { ok: true };
    }
    catch (err) {
        return invalid(err?.message ?? String(err));
    }
}
