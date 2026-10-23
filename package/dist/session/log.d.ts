export interface ActiveFile {
    path: string;
    sha1_8: string;
    mtime: string;
}
export interface SessionSummary {
    id: string;
    file: string;
    cwd: string;
    providerId: string;
    model: string;
    turns: number;
    activeFiles: ActiveFile[];
    messages: number;
    lastTs: number;
}
export declare function sessionCacheLimitBytes(): number;
export declare function loggingEnabled(): boolean;
export declare function projectionPath(file: string): string;
export declare function fsyncMode(): "on" | "off" | "auto";
export declare function fsyncEnabled(type?: string): boolean;
export declare function createSessionLog(meta?: Record<string, any>): {
    id: string;
    file: string;
    append: (entry: Record<string, any>) => number;
    count(): number;
    close(): void;
};
export declare function openSessionLog(file: string, meta?: Record<string, any>): {
    id: string;
    file: string;
    append: (entry: Record<string, any>) => number;
    count(): number;
    close(): void;
};
export declare function listSessions(): {
    id: string;
    file: string;
    bytes: number;
    modified: string;
    messages: number;
}[];
export declare function resolveSessionFile(idOrFile: string): string;
export declare function readSession(idOrFile: string): any[];
export declare function loadSessionMessages(idOrFile: string): {
    role: any;
    content: any;
}[];
export declare function latestSessionFile(): string | undefined;
export declare function findUnclosedSessions(): SessionSummary[];
export declare function latestUnclosedSession(): SessionSummary | undefined;
export declare function pruneSessions(limit?: number): number;
