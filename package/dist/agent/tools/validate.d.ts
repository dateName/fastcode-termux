import type { Prepared, ToolCall } from "./types.js";
export declare function invalid(output: string): Prepared;
export declare function requiredString(call: ToolCall, key: string): string;
export declare function stringArray(call: ToolCall, key: string): string[];
export declare function numberOption(value: any, fallback: number): number;
export declare function preparePath(cwd: string, raw: string): Prepared;
