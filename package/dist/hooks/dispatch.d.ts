import type { AgentEvent } from "../agent/runner.js";
import type { HookEvent } from "./hook-host.js";
export interface HookContext {
    taskId?: string;
    cwd?: string;
    providerId?: string;
    model?: string;
}
export interface HookHostOptions {
    enabled: boolean;
    taskId?: string;
    cwd?: string;
    providerId?: string;
    model?: string;
}
/** CLI opt-in: FASTCODE_HOOKS defaults to off. */
export declare function hooksEnabledFromEnv(): boolean;
/** Map the three observable AgentEvents to hook names. Pure, no I/O. */
export declare function hookEventFor(event: AgentEvent): HookEvent | undefined;
/**
 * Start the hook host for one run. Never throws: a host failure is logged
 * and hooks are skipped for the rest of the run.
 */
export declare function startHookHost(options: HookHostOptions): Promise<void>;
export declare function dispatchHook(event: HookEvent, ctx?: HookContext): Promise<void>;
/**
 * Wait for pending hooks. By default also stop the host; the TUI keeps it
 * warm between prompts and calls shutdownHookHost() on exit.
 * Never throws.
 */
export declare function stopHookHost(options?: {
    shutdown?: boolean;
}): Promise<void>;
/** Kill a warm host at process/TUI exit. Never throws. */
export declare function shutdownHookHost(): Promise<void>;
