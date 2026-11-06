import type { Prepared, ToolCall, ToolErrorCode } from "./types.js";
export declare function invalid(output: string, code?: ToolErrorCode, hint?: string): Prepared;
export declare function requiredString(call: ToolCall, key: string): string;
export declare function stringArray(call: ToolCall, key: string): string[];
export declare function numberOption(value: any, fallback: number): number;
export declare function optionalNumber(call: ToolCall, key: string): number | undefined;
export declare function clampInt(value: number | undefined, fallback: number, min: number, max: number): number;
export declare function booleanOption(value: any, fallback?: boolean): boolean;
export declare const MAX_TIMEOUT_MS = 2147483647;
/**
 * Normalize a tool `timeoutMs` value.
 *
 * Only `null`/`undefined` mean "not specified". Any other non-number, NaN,
 * Infinity, or negative value is a caller error and must be surfaced instead
 * of silently falling back. Large finite values are clamped to the
 * `setTimeout` ceiling (2^31-1) rather than overflowing to 1ms.
 */
export declare function normalizeTimeoutMs(value: unknown, fallback?: number): number;
export declare function preparePath(cwd: string, raw: string): Prepared;
