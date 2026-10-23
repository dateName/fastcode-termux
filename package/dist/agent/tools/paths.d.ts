import type { ToolCall } from "./types.js";
export declare function allowedRoots(cwd: string): string[];
export declare function resolveSharedDir(cwd: string, entry: string): string;
export declare function isInsideAny(child: string, roots: string[]): boolean;
export declare function resolvePath(cwd: string, call: ToolCall, fallback?: string): string;
export declare function sandboxPath(cwd: string, raw: string): string;
export declare function realpathOf(input: string): string | undefined;
