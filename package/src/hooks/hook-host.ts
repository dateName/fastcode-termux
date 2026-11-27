/**
 * H1 hook-host contract.
 *
 * Types and constants shared by the host runner and dispatch. The host
 * process/IPC lives in hook-host-runner.ts and dispatch.ts.
 */
import type { AgentEvent } from "../agent/runner.js";

/** Per-event soft timeout: mark the hook abandoned, keep the run alive. */
export const HOOK_TIMEOUT_SOFT = 1500;

/** Host hard timeout: SIGKILL the child host if it is still stuck. */
export const HOOK_TIMEOUT_HARD = 3000;

export type HookName = "on-tool-call" | "on-tool-result" | "on-run-complete";

export interface HookEvent {
    name: HookName;
    event: AgentEvent;
}

export interface HookResult {
    ok: boolean;
    error?: string;
    durationMs?: number;
}
