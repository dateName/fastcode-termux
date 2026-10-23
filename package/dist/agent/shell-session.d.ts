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
}
interface ExecOptions {
    signal?: AbortSignal;
    turn?: number;
    timeoutMs?: number;
    backgroundAfterMs?: number;
}
export declare function executeShellCommand(command: string, cwd: string, options?: ExecOptions): Promise<ShellExecResult>;
export declare function pollShellSession(id: string, waitMs?: number): Promise<ShellExecResult | undefined>;
export declare function killShellSession(id: string): boolean;
export declare function listShellSessions(): ShellJobView[];
export declare function shutdownShells(): void;
export declare function shellPoolStats(): {
    spawns: number;
    active: number;
    pool: number;
    maxSpawnPerTurn: number;
};
export {};
