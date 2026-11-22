import type { ToolCheckResult } from "./tools/types.js";
/**
 * Run a user-configured post-write check. The command is static config, never
 * model output; changed files are passed through FASTCODE_CHECK_FILES. A failed
 * or timed-out check is reported but never changes the tool's own ok flag.
 */
export declare function runCheckCommand(command: string, cwd: string, files: string[], timeoutMs?: number): Promise<ToolCheckResult | undefined>;
