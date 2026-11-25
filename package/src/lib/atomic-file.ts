import { constants, createReadStream, lstatSync, readdirSync } from "node:fs";
import { chmod, copyFile, lstat, open, rename, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

function noFollowFlag(): number {
    const flag = constants.O_NOFOLLOW;
    if (typeof flag === "number")
        return flag;
    if (process.platform === "win32")
        return 0;
    throw new Error("O_NOFOLLOW unavailable; refusing unsafe atomic write");
}

export const TEMP_WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag();
const TARGET_WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollowFlag();

export interface AtomicWriteOptions {
    mode?: number;
}

export interface AtomicWriteResult {
    /** False when the fallback copy path was used instead of rename. */
    atomic: boolean;
    backupPath?: string;
}

export class AtomicWriteError extends Error {
    readonly backupPath?: string;
    constructor(message: string, backupPath?: string) {
        super(message);
        this.name = "AtomicWriteError";
        this.backupPath = backupPath;
    }
}

export interface AtomicIo {
    rename: typeof rename;
    copyFile: typeof copyFile;
    open: typeof open;
    chmod: typeof chmod;
    rm: typeof rm;
    lstat: typeof lstat;
    stat: typeof stat;
    createReadStream: typeof createReadStream;
    lstatSync: typeof lstatSync;
}

export interface AtomicTemp {
    readonly path: string;
    write(data: string | Uint8Array): Promise<void>;
    fill(source: Readable): Promise<void>;
    commit(): Promise<AtomicWriteResult>;
    discard(): Promise<void>;
}

const defaultIo: AtomicIo = { rename, copyFile, open, chmod, rm, lstat, stat, createReadStream, lstatSync };
const NON_FALLBACK_CODES = new Set(["EISDIR", "ENOTDIR", "ELOOP", "ENAMETOOLONG", "ENOENT", "ENOSPC", "EROFS", "EDQUOT"]);

function isNonFallback(err: any): boolean {
    return Boolean(err?.code && NON_FALLBACK_CODES.has(err.code));
}

export function tempSibling(file: string): string {
    return join(dirname(file), `.fastcode-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
}

function backupSibling(file: string): string {
    return `${file}.fastcode-backup-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function removeQuietly(io: AtomicIo, path: string): Promise<void> {
    await io.rm(path, { force: true }).catch(() => undefined);
}

async function filesEqual(io: AtomicIo, a: string, b: string): Promise<boolean> {
    const [left, right] = await Promise.all([io.stat(a), io.stat(b)]);
    if (left.size !== right.size)
        return false;
    const hash = async (file: string) => {
        const digest = createHash("sha256");
        await pipeline(io.createReadStream(file), digest);
        return digest.digest("hex");
    };
    return (await hash(a)) === (await hash(b));
}

async function writeTargetNoFollow(io: AtomicIo, target: string, source: string, mode?: number): Promise<void> {
    const handle = await io.open(target, TARGET_WRITE_FLAGS, mode ?? 0o666);
    try {
        await pipeline(io.createReadStream(source), handle.createWriteStream());
    }
    finally {
        await handle.close();
    }
    if (mode !== undefined)
        await io.chmod(target, mode).catch(() => undefined);
}

async function openTemp(io: AtomicIo, path: string, mode?: number) {
    return await io.open(path, TEMP_WRITE_FLAGS, mode ?? 0o666);
}

export function createAtomicFile(ioOverrides: Partial<AtomicIo> = {}) {
    const io: AtomicIo = { ...defaultIo, ...ioOverrides };

    async function commitTemp(tmp: string, target: string, options: AtomicWriteOptions = {}): Promise<AtomicWriteResult> {
        const mode = options.mode;
        try {
            await io.rename(tmp, target);
            return { atomic: true };
        }
        catch (err: any) {
            if (isNonFallback(err)) {
                await removeQuietly(io, tmp);
                throw err;
            }
        }

        // lstat is only for a friendly error; the final open uses O_NOFOLLOW so a
        // race cannot redirect the write through a symlink.
        try {
            if (io.lstatSync(target).isSymbolicLink())
                throw new Error("refusing to overwrite a symlink: " + target);
        }
        catch (err: any) {
            if (err?.code !== "ENOENT") {
                await removeQuietly(io, tmp);
                throw err;
            }
        }

        let backupPath: string | undefined;
        try {
            backupPath = backupSibling(target);
            await io.copyFile(target, backupPath, constants.COPYFILE_EXCL);
        }
        catch (err: any) {
            backupPath = undefined;
            if (err?.code !== "ENOENT") {
                await removeQuietly(io, tmp);
                throw err;
            }
        }

        let keepBackup = false;
        try {
            await writeTargetNoFollow(io, target, tmp, mode);
            if (!(await filesEqual(io, tmp, target)))
                throw new Error("atomic write readback mismatch: " + target);
            await removeQuietly(io, tmp);
            if (backupPath)
                await removeQuietly(io, backupPath);
            return { atomic: false };
        }
        catch (err: any) {
            let restored = !backupPath;
            if (backupPath) {
                try {
                    await writeTargetNoFollow(io, target, backupPath, mode);
                    restored = true;
                    keepBackup = true;
                }
                catch {
                    keepBackup = true;
                }
            }
            else {
                await removeQuietly(io, target);
            }
            await removeQuietly(io, tmp);
            if (backupPath && !keepBackup)
                await removeQuietly(io, backupPath);
            if (keepBackup)
                throw new AtomicWriteError(`${err?.message ?? err}; restore failed, backup kept at ${backupPath}`, backupPath);
            if (!restored)
                throw new AtomicWriteError(`${err?.message ?? err}; restore failed`, backupPath);
            throw err;
        }
    }

    function temp(target: string, options: AtomicWriteOptions = {}): AtomicTemp {
        const path = tempSibling(target);
        let written = false;
        let settled = false;
        const ensureWritable = () => {
            if (settled)
                throw new Error("atomic temp already committed/discarded");
            if (written)
                throw new Error("atomic temp already written");
        };
        return {
            path,
            async write(data) {
                ensureWritable();
                const handle = await openTemp(io, path, options.mode);
                try {
                    await handle.writeFile(data, typeof data === "string" ? "utf8" : undefined);
                }
                finally {
                    await handle.close().catch(() => undefined);
                }
                written = true;
            },
            async fill(source) {
                ensureWritable();
                const handle = await openTemp(io, path, options.mode);
                try {
                    await pipeline(source, handle.createWriteStream());
                }
                finally {
                    await handle.close().catch(() => undefined);
                }
                written = true;
            },
            async commit() {
                if (settled)
                    throw new Error("atomic temp already committed/discarded");
                settled = true;
                return await commitTemp(path, target, options);
            },
            async discard() {
                if (settled)
                    return;
                settled = true;
                await removeQuietly(io, path);
            },
        };
    }

    async function write(target: string, contents: string | Uint8Array, options: AtomicWriteOptions = {}): Promise<AtomicWriteResult> {
        const staged = temp(target, options);
        try {
            await staged.write(contents);
            return await staged.commit();
        }
        catch (err) {
            await staged.discard();
            throw err;
        }
    }

    function backups(dir: string): string[] {
        try {
            return readdirSync(dir)
                .filter((name) => /\.fastcode-backup-\d+-\d+-[a-z0-9]+$/.test(name))
                .map((name) => join(dir, name));
        }
        catch {
            return [];
        }
    }

    return { write, temp, backups };
}

export const atomicFile = createAtomicFile();
