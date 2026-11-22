import { chmod, copyFile, lstat, open, rename, rm, stat } from "node:fs/promises";
import type { Readable } from "node:stream";
export declare const TEMP_WRITE_FLAGS: number;
export interface AtomicWriteOptions {
    mode?: number;
}
export interface AtomicWriteResult {
    /** False when the fallback copy path was used instead of rename. */
    atomic: boolean;
    backupPath?: string;
}
export declare class AtomicWriteError extends Error {
    readonly backupPath?: string;
    constructor(message: string, backupPath?: string);
}
export interface AtomicIo {
    rename: typeof rename;
    copyFile: typeof copyFile;
    open: typeof open;
    chmod: typeof chmod;
    rm: typeof rm;
    lstat: typeof lstat;
    stat: typeof stat;
}
export interface AtomicTemp {
    readonly path: string;
    write(data: string | Uint8Array): Promise<void>;
    fill(source: Readable): Promise<void>;
    commit(): Promise<AtomicWriteResult>;
    discard(): Promise<void>;
}
export declare function tempSibling(file: string): string;
export declare function createAtomicFile(ioOverrides?: Partial<AtomicIo>): {
    write: (target: string, contents: string | Uint8Array, options?: AtomicWriteOptions) => Promise<AtomicWriteResult>;
    temp: (target: string, options?: AtomicWriteOptions) => AtomicTemp;
    backups: (dir: string) => string[];
};
export declare const atomicFile: {
    write: (target: string, contents: string | Uint8Array, options?: AtomicWriteOptions) => Promise<AtomicWriteResult>;
    temp: (target: string, options?: AtomicWriteOptions) => AtomicTemp;
    backups: (dir: string) => string[];
};
