import { type ChildProcess } from "node:child_process";
export declare const KILL_GRACE_MS = 1000;
export interface TerminateOptions {
    /** Milliseconds to wait after SIGTERM before escalating to SIGKILL. */
    graceMs?: number;
}
/**
 * Send a single signal to the process group (falling back to the pid).
 * Kept for callers that need one-shot signalling; shell sessions should use
 * terminateProcessTree so SIGKILL escalation is always available.
 */
export declare function killProcessTree(child: ChildProcess | undefined, signal?: NodeJS.Signals): void;
/**
 * Terminate a spawned process group with a SIGTERM -> grace -> SIGKILL flow.
 *
 * Boundary: this only guarantees the spawned process group is killed. A
 * descendant that calls setsid() leaves the group and may escape; we do not
 * scan for ppid=1 processes because that risks killing unrelated background
 * jobs on Termux. Callers should report
 * "process group killed; setsid descendants may escape".
 */
export declare function terminateProcessTree(child: ChildProcess | undefined, options?: TerminateOptions): void;
