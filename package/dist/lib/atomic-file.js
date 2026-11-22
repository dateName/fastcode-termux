import { constants, createReadStream, lstatSync, readdirSync } from "node:fs";
import { chmod, copyFile, lstat, open, rename, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
export const TEMP_WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
const TARGET_WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0);
export class AtomicWriteError extends Error {
    backupPath;
    constructor(message, backupPath) {
        super(message);
        this.name = "AtomicWriteError";
        this.backupPath = backupPath;
    }
}
const defaultIo = { rename, copyFile, open, chmod, rm, lstat, stat };
const NON_FALLBACK_CODES = new Set(["EISDIR", "ENOTDIR", "ELOOP", "ENAMETOOLONG", "ENOENT", "ENOSPC", "EROFS", "EDQUOT"]);
function isNonFallback(err) {
    return Boolean(err?.code && NON_FALLBACK_CODES.has(err.code));
}
export function tempSibling(file) {
    return join(dirname(file), `.fastcode-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
}
function backupSibling(file) {
    return `${file}.fastcode-backup-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function removeQuietly(io, path) {
    await io.rm(path, { force: true }).catch(() => undefined);
}
async function filesEqual(a, b) {
    const [left, right] = await Promise.all([stat(a), stat(b)]);
    if (left.size !== right.size)
        return false;
    const hash = async (file) => {
        const digest = createHash("sha256");
        await pipeline(createReadStream(file), digest);
        return digest.digest("hex");
    };
    return (await hash(a)) === (await hash(b));
}
async function writeTargetNoFollow(io, target, source, mode) {
    const handle = await io.open(target, TARGET_WRITE_FLAGS, mode ?? 0o666);
    try {
        await pipeline(createReadStream(source), handle.createWriteStream());
    }
    finally {
        await handle.close();
    }
    if (mode !== undefined)
        await chmod(target, mode).catch(() => undefined);
}
async function openTemp(io, path, mode) {
    return await io.open(path, TEMP_WRITE_FLAGS, mode ?? 0o666);
}
export function createAtomicFile(ioOverrides = {}) {
    const io = { ...defaultIo, ...ioOverrides };
    async function commitTemp(tmp, target, options = {}) {
        const mode = options.mode;
        try {
            await io.rename(tmp, target);
            return { atomic: true };
        }
        catch (err) {
            if (isNonFallback(err)) {
                await removeQuietly(io, tmp);
                throw err;
            }
        }
        // lstat is only for a friendly error; the final open uses O_NOFOLLOW so a
        // race cannot redirect the write through a symlink.
        try {
            if (lstatSync(target).isSymbolicLink())
                throw new Error("refusing to overwrite a symlink: " + target);
        }
        catch (err) {
            if (err?.code !== "ENOENT") {
                await removeQuietly(io, tmp);
                throw err;
            }
        }
        let backupPath;
        try {
            backupPath = backupSibling(target);
            await io.copyFile(target, backupPath);
        }
        catch (err) {
            backupPath = undefined;
            if (err?.code !== "ENOENT") {
                await removeQuietly(io, tmp);
                throw err;
            }
        }
        let keepBackup = false;
        try {
            await writeTargetNoFollow(io, target, tmp, mode);
            if (!(await filesEqual(tmp, target)))
                throw new Error("atomic write readback mismatch: " + target);
            await removeQuietly(io, tmp);
            if (backupPath)
                await removeQuietly(io, backupPath);
            return { atomic: false };
        }
        catch (err) {
            let restored = !backupPath;
            if (backupPath) {
                try {
                    await io.copyFile(backupPath, target);
                    restored = true;
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
    function temp(target, options = {}) {
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
    async function write(target, contents, options = {}) {
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
    function backups(dir) {
        try {
            return readdirSync(dir)
                .filter((name) => name.includes(".fastcode-backup-"))
                .map((name) => join(dir, name));
        }
        catch {
            return [];
        }
    }
    return { write, temp, backups };
}
export const atomicFile = createAtomicFile();
