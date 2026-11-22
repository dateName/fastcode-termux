import type { ToolCall } from "./types.js";
export { realpathOf } from "../../lib/realpath.js";
export declare function allowedRoots(cwd: string): string[];
export declare function resolveSharedDir(cwd: string, entry: string): string;
export declare function isInsideAny(child: string, roots: string[]): boolean;
export declare function resolvePath(cwd: string, call: ToolCall, fallback?: string): string;
export declare function sandboxPath(cwd: string, raw: string): string;
/**
 * Resolve a write target through symlinks and return the real path that will be
 * written. A dangling symlink resolves to its (possibly outside) target, so it
 * is rejected instead of being mistaken for a missing in-sandbox path.
 */
export declare function sandboxWritePath(cwd: string, raw: string): string;
/** Reject a symlink at the final component before opening it for writing. */
export declare function assertNotSymlink(file: string): void;
export declare function existingMode(file: string): Promise<number | undefined>;
