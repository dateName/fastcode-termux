/**
 * M1 error/status mapping: internal agent reasons -> public SDK contract.
 *
 * The public types are defined in src/public/types.ts. This module only maps
 * them; it must not introduce a second error model.
 */
import type { AgentErrorKind, AgentStopReason } from "../agent/runner.js";
import type { RunError, TaskStatus } from "../public/types.js";
export declare function taskStatusForStopReason(reason: AgentStopReason): TaskStatus;
export declare function runErrorForErrorKind(kind: AgentErrorKind, message: string): RunError;
/**
 * Run-level error for a terminal stop reason.
 * "complete" and "aborted" produce no error: aborted is a user stop
 * (`status: "stopped"`), not a failure.
 */
export declare function runErrorForStopReason(reason: AgentStopReason, message?: string): RunError | null;
