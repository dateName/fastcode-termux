export declare function readMany(cwd: string, paths: string[]): Promise<string>;
export declare function listFiles(sandbox: string, root: string, maxDepth: number, detail: boolean): Promise<string>;
export declare function formatSize(bytes: number): string;
export declare function grepFiles(sandbox: string, root: string, pattern: string, maxDepth: number): Promise<string>;
export declare function readTextFile(file: string, limit?: number): Promise<string>;
export declare function readMaxBytes(): number;
