export interface ReadManyResult {
    text: string;
    truncated: boolean;
    totalBytes: number;
    returnedBytes: number;
    filesRead: number;
    filesSkipped: number;
}
export declare function readManyResult(cwd: string, paths: string[], maxBytes?: number): Promise<ReadManyResult>;
export declare function readMany(cwd: string, paths: string[]): Promise<string>;
export declare function listFiles(sandbox: string, root: string, maxDepth: number, detail: boolean): Promise<string>;
export declare function formatSize(bytes: number): string;
export interface GrepOptions {
    pattern: string;
    flags?: string;
    glob?: string;
    context?: number;
    maxResults?: number;
    maxDepth?: number;
    signal?: AbortSignal;
}
export interface GrepResult {
    text: string;
    truncated: boolean;
    matchCount: number;
    filesScanned: number;
}
export declare function grepFiles(sandbox: string, root: string, options: GrepOptions): Promise<GrepResult>;
export interface ReadTextResult {
    text: string;
    truncated: boolean;
    totalLines?: number;
    returnedLines: number;
    totalBytes: number;
    returnedBytes: number;
    binary: boolean;
}
export declare function readTextFileResult(file: string, limit?: number): Promise<ReadTextResult>;
export interface ReadRangeResult {
    text: string;
    truncated: boolean;
    totalLines: number;
    returnedLines: number;
    totalBytes: number;
    returnedBytes: number;
    scannedAll: boolean;
    binary: boolean;
}
export declare function readFileRange(file: string, offset: number, limit: number, options?: {
    maxBytes?: number;
    scanMaxBytes?: number;
    signal?: AbortSignal;
}): Promise<ReadRangeResult>;
export declare function readTextFile(file: string, limit?: number): Promise<string>;
export declare function readMaxBytes(): number;
export declare function grepMaxBytes(): number;
export declare function readScanMaxBytes(): number;
export declare function readManyMaxBytes(): number;
