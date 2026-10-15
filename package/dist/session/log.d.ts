export declare function sessionCacheLimitBytes(): number;
export declare function loggingEnabled(): boolean;
export declare function createSessionLog(meta?: {}): {
    id: any;
    file: any;
    append: (entry: any) => void;
    close(): void;
};
export declare function openSessionLog(file: any): {
    id: any;
    file: any;
    append: (entry: any) => void;
    close(): void;
};
export declare function listSessions(): {
    id: string;
    file: string;
    bytes: number;
    modified: string;
    messages: number;
}[];
export declare function resolveSessionFile(idOrFile: any): any;
export declare function readSession(idOrFile: any): any[];
export declare function loadSessionMessages(idOrFile: any): {
    role: any;
    content: any;
}[];
export declare function latestSessionFile(): string;
export declare function pruneSessions(limit?: number): number;
