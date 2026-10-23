import { sandboxPath } from "./paths.js";
import type { Prepared, ToolCall } from "./types.js";

export function invalid(output: string): Prepared {
    return { ok: false, output };
}

export function requiredString(call: ToolCall, key: string): string {
    const value = call[key];
    if (typeof value !== "string")
        throw new Error(`${key} must be a string`);
    return value;
}

export function stringArray(call: ToolCall, key: string): string[] {
    const value = call[key];
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error(`${key} must be an array of strings`);
    }
    return value;
}

export function numberOption(value: any, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function preparePath(cwd: string, raw: string): Prepared {
    try {
        sandboxPath(cwd, raw);
        return { ok: true };
    }
    catch (err: any) {
        return invalid(err?.message ?? String(err));
    }
}
