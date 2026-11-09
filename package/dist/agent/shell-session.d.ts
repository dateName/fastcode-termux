export type ShellJobStatus = "running" | "done" | "failed" | "killed" | "timeout";
export interface ShellExecResult {
    ok: boolean;
    status: ShellJobStatus;
    output: string;
    exitCode?: number | null;
    sessionId?: string;
    nextPollMs?: number;
}
export interface ShellJobView {
    id: string;
    command: string;
    cwd: string;
    status: ShellJobStatus;
    exitCode?: number | null;
    bytes: number;
    startedAt: number;
    pid?: number;
    /** Lifecycle visibility for /jobs and regression tests. */
    timeoutArmed?: boolean;
    foregroundAttached?: boolean;
}
interface ExecOptions {
    signal?: AbortSignal;
    turn?: number;
    timeoutMs?: number;
    backgroundAfterMs?: number;
}
export declare const DEFAULT_SHELL_POOL_SIZE = 2;
export declare const MAX_SHELL_POOL_SIZE = 6;
export declare function executeShellCommand(command: string, cwd: string, options?: ExecOptions): Promise<ShellExecResult>;
export declare function pollShellSession(id: string, waitMs?: number): Promise<ShellExecResult | undefined>;
export declare function killShellSession(id: string): boolean;
export declare function listShellSessions(): ShellJobView[];
export declare function shutdownShells(): void;
/**
 * Exit-safe stop: send SIGTERM, wait briefly for close, then force SIGKILL.
 * Use this when the process is about to exit and must not leave children.
 */
export declare function shutdownShellsAsync(graceMs?: number): Promise<void>;
export declare function shellPoolSize(): number;
/** Clamp and apply the resident shell concurrency (1..6, default 2). */
export declare function setShellPoolSize(size: number): number;
export declare function shellPoolStats(): {
    spawns: number;
    active: number;
    pool: number;
    maxPool: number;
    maxSpawnPerTurn: number;
};
export {};
