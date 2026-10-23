import type { Tool } from "./types.js";
/**
 * Atomic multi-file patch.
 *
 * Applies Add / Delete / Update / Move only after every file plan succeeds.
 * Symbolic links are refused, CRLF and mode bits are preserved, and per-file
 * diffs are returned. xattr / ACL are NOT preserved and the inode changes
 * (tmp+rename); restart file watchers if they miss the change.
 */
export declare const applyPatchTool: Tool;
