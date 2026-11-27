/**
 * Public SDK contract for programmatic FastCode use.
 *
 * These types are the stable surface. Internal agent types (AgentEvent,
 * AgentStopReason, ...) stay in src/agent; public types reference them where
 * needed but do not redefine their fields.
 */
import type { AgentEvent } from "../agent/runner.js";
export type TaskStatus = "completed" | "failed" | "stopped";
export type RunErrorCategory = "auth" | "config" | "network" | "timeout" | "cancelled" | "agent" | "infrastructure" | "unknown";
export interface RunError {
    code: string;
    category: RunErrorCategory;
    retryable: boolean;
    message: string;
}
export interface RunConfig {
    prompt: string;
    provider?: string;
    model?: string;
    cwd?: string;
    system?: string;
    maxTurns?: number;
    signal?: AbortSignal;
    taskId?: string;
}
export interface RunOptions {
    onProgress?: (message: string) => void;
    onEvent?: (event: AgentEvent) => void;
    onComplete?: (result: RunResult) => void;
    onError?: (error: RunError) => void;
    /** H1a skeleton: accepted but not read; default false. */
    enableHooks?: boolean;
}
export interface TaskHandle {
    taskId: string;
    logPath: string;
    wait(): Promise<RunResult>;
    stop(): Promise<void>;
}
export interface RunResult {
    taskId: string;
    status: TaskStatus;
    sessionId: string | null;
    error: RunError | null;
    logPath: string;
    durationMs: number;
}
