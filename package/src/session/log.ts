/**
 * Append-only JSONL session log.
 *
 * Every entry is flushed as its own line, so a crash (or a kill from the
 * Android task switcher) still leaves a readable transcript that can be
 * resumed. A size cap keeps the sessions directory bounded; the oldest logs are
 * pruned first.
 *
 *   FASTCODE_SESSION_LOG=0        disable logging
 *   FASTCODE_SESSION_CACHE_MB=N   sessions cache cap in MB (default 256)
 *   FASTCODE_FSYNC=0|1            force checkpoint fsync off/on
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { getPaths } from "../config/paths.js";
import { removeSummaryFile } from "../agent/compaction.js";
import { removeRawOutputsForSession } from "./raw-output.js";
import { realpathOf } from "../lib/realpath.js";
import { buildProjection, writeProjection } from "./projection.js";

const NL = String.fromCharCode(10);

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

/** Reserved slot for conversation compaction at the exit save point. */
export interface SessionCompactionSlot {
    source?: "local" | "server" | "none";
    summaryRef?: string | null;
    pending?: boolean;
}

export interface SessionCloseInfo {
    reason?: "exit" | "signal" | "fatal" | "close";
    compaction?: SessionCompactionSlot;
}

export function sessionCacheLimitBytes(): number {
    const mb = Number(process.env["FASTCODE_SESSION_CACHE_MB"]);
    return (Number.isFinite(mb) && mb > 0 ? mb : 256) * 1024 * 1024;
}

export function loggingEnabled(): boolean {
    return process.env["FASTCODE_SESSION_LOG"] !== "0";
}

export function projectionPath(file: string): string {
    return file.replace(/[.]jsonl$/i, ".projection.json");
}

export function fsyncMode(): "on" | "off" | "auto" {
    const raw = (process.env["FASTCODE_FSYNC"] ?? "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(raw))
        return "on";
    if (["0", "false", "no", "off"].includes(raw))
        return "off";
    return "auto";
}

function onSharedStorage(root: string): boolean {
    const normalized = root.replace(/\\/g, "/");
    return normalized === "/sdcard"
        || normalized.startsWith("/sdcard/")
        || normalized === "/storage/emulated"
        || normalized.startsWith("/storage/emulated/");
}

export function fsyncEnabled(type = "checkpoint"): boolean {
    if (type !== "checkpoint")
        return false;
    const mode = fsyncMode();
    if (mode === "on")
        return true;
    if (mode === "off")
        return false;
    return onSharedStorage(getPaths().root);
}

function writeLine(file: string, line: string, type: string): void {
    if (!fsyncEnabled(type)) {
        appendFileSync(file, line, { encoding: "utf8", mode: 0o600 });
        return;
    }
    const fd = openSync(file, "a", 0o600);
    try {
        writeSync(fd, line);
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
}

function fsyncPath(file: string): void {
    if (!existsSync(file))
        return;
    try {
        const fd = openSync(file, "r");
        try {
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
    }
    catch {
        // FUSE / read-only filesystems may reject fsync; the append is still
        // best effort and the caller already caught close-level failures.
    }
}

function countLines(file: string): number {
    if (!existsSync(file))
        return 0;
    try {
        return readFileSync(file, "utf8").split(NL).filter(Boolean).length;
    }
    catch {
        return 0;
    }
}

function newId(): string {
    return new Date().toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
}

function openLog(id: string | undefined, file: string, meta: Record<string, any>) {
    let closed = false;
    let degraded = false;
    let lastError: string | undefined;
    let warnedDegraded = false;
    let seq = countLines(file);
    const append = (entry: Record<string, any>) => {
        if (closed || !loggingEnabled())
            return 0;
        const next = seq + 1;
        const line = JSON.stringify({ ts: Date.now(), seq: next, ...entry }) + NL;
        try {
            writeLine(file, line, String(entry.type ?? ""));
            seq = next;
            return next;
        }
        catch (err) {
            // Never route this through pushSystem: that would append a notice
            // and recurse into the same failing write. The process-level
            // degraded flag is the durable signal; stderr is the human one.
            degraded = true;
            lastError = err instanceof Error ? err.message : String(err);
            if (!warnedDegraded) {
                warnedDegraded = true;
                process.stderr.write(`[fastcode] session log write failed; persistence is degraded (${lastError}). ` +
                    `The session will not be resumed from this copy.\n`);
            }
            return 0;
        }
    };
    append({ type: "session_start", id, cwd: process.cwd(), ...meta });
    return {
        id,
        file,
        append,
        count() {
            return seq;
        },
        nextSeq() {
            return seq + 1;
        },
        /** True after at least one write failed (or the log is otherwise unreliable). */
        degraded() {
            return degraded;
        },
        lastError() {
            return lastError;
        },
        checkpoint() {
            if (degraded || !loggingEnabled())
                return;
            try {
                ensureProjection(file);
                fsyncPath(file);
                fsyncPath(projectionPath(file));
            }
            catch {
                // checkpoint is best effort; the fact stream remains authoritative
            }
        },
        close(info: SessionCloseInfo = {}) {
            if (closed)
                return;
            append({
                type: "session_end",
                reason: info.reason ?? "close",
                // Reserved extension point: future compaction can fill this
                // slot without changing the session_end event shape.
                compaction: {
                    source: info.compaction?.source ?? "none",
                    summaryRef: info.compaction?.summaryRef ?? null,
                    pending: info.compaction?.pending ?? false,
                },
            });
            closed = true;
            // A partial/degraded JSONL must never be frozen into a "verified"
            // projection: resume would trust a manifest computed from the
            // missing facts. Logging disabled is an intentional no-persist mode
            // and also has no projection to write.
            if (degraded || !loggingEnabled()) {
                if (degraded)
                    process.stderr.write(`[fastcode] session log degraded; projection and pruning skipped for ${file}.\n`);
                return;
            }
            try {
                // Snapshot + manifest are written while the facts still exist;
                // pruning later keeps this verified copy.
                ensureProjection(file);
                fsyncPath(file);
                fsyncPath(projectionPath(file));
                pruneSessions();
            }
            catch {
                // best effort
            }
        },
    };
}

/** Summary files referenced by older compacted facts in this session. */
export function staleSummaryRefs(file: string): string[] {
    let facts: any[];
    try {
        facts = readSession(file);
    }
    catch {
        return [];
    }
    const compacted = facts.filter((fact) => fact?.type === "compacted");
    const latest = compacted.at(-1)?.summaryRef;
    return Array.from(new Set(compacted
        .map((fact) => fact.summaryRef)
        .filter((ref): ref is string => typeof ref === "string" && ref.length > 0 && ref !== latest)));
}

export function createSessionLog(meta: Record<string, any> = {}) {
    const { sessions } = getPaths();
    mkdirSync(sessions, { recursive: true });
    const id = newId();
    const file = join(sessions, id + ".jsonl");
    return openLog(id, file, meta);
}

export function openSessionLog(file: string, meta: Record<string, any> = {}) {
    const { sessions } = getPaths();
    mkdirSync(sessions, { recursive: true });
    return openLog(undefined, existsSync(file) ? file : join(sessions, file), meta);
}

export function listSessions() {
    const { sessions } = getPaths();
    if (!existsSync(sessions))
        return [];
    const ids = new Set(readdirSync(sessions)
        .filter((name) => name.endsWith(".jsonl") || name.endsWith(".projection.json"))
        .map((name) => name.replace(/[.](jsonl|projection[.]json)$/, "")));
    return Array.from(ids)
        .map((id) => {
            const file = join(sessions, id + ".jsonl");
            const projection = projectionPath(file);
            const path = existsSync(file) ? file : projection;
            let bytes = 0;
            let modified = "";
            let messages = 0;
            let cwd = "";
            let model = "";
            try {
                const info = statSync(path);
                bytes = info.size;
                modified = info.mtime.toISOString();
                if (existsSync(file)) {
                    const entries = readSession(file);
                    const summary = summarize(id, file, entries);
                    cwd = summary.cwd;
                    model = summary.model ? `${summary.providerId}::${summary.model}` : "";
                    messages = entries.filter((entry) => entry.type === "user" ||
                        (entry.type === "message" && entry.role === "user")).length;
                }
                else {
                    const parsed = JSON.parse(readFileSync(projection, "utf8"));
                    messages = Array.isArray(parsed.messages)
                        ? parsed.messages.filter((message: any) => message.role === "user").length
                        : 0;
                    cwd = String(parsed.meta?.cwd ?? "");
                    model = parsed.meta?.providerId ? `${parsed.meta.providerId}::${parsed.meta.model ?? ""}` : "";
                }
            }
            catch {
                // unreadable: report what we have
            }
            return { id, file, bytes, modified, messages, cwd, model };
        })
        .sort((a, b) => (a.modified < b.modified ? 1 : -1));
}

export function resolveSessionFile(idOrFile: string): string {
    const { sessions } = getPaths();
    const looksLikePath = idOrFile.includes("/") || idOrFile.includes(String.fromCharCode(92)) || idOrFile.endsWith(".jsonl");
    return looksLikePath ? idOrFile : join(sessions, idOrFile + ".jsonl");
}

/**
 * Resolve a `resume` target without accepting arbitrary files. Only a bare
 * session id (under the sessions directory) or an existing `.jsonl` path inside
 * that directory is allowed; anything else returns undefined.
 */
export function resolveResumeFile(idOrFile: string): string | undefined {
    const { sessions } = getPaths();
    const jsonl = /[.]jsonl$/i.test(idOrFile);
    const looksLikePath = idOrFile.includes("/") || idOrFile.includes(String.fromCharCode(92)) || jsonl;
    if (!looksLikePath)
        return join(sessions, idOrFile + ".jsonl");
    if (!jsonl)
        return undefined;
    const root = realpathOf(resolve(sessions)) ?? resolve(sessions);
    const file = realpathOf(resolve(idOrFile)) ?? resolve(idOrFile);
    const rel = relative(root, file);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel))
        return undefined;
    return file;
}

export function readSession(idOrFile: string) {
    const file = resolveSessionFile(idOrFile);
    if (!existsSync(file))
        return [];
    return readFileSync(file, "utf8")
        .split(NL)
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return undefined;
            }
        })
        .filter(Boolean);
}

export function loadSessionMessages(idOrFile: string) {
    return readSession(idOrFile)
        .filter((entry) => (entry.type === "message" || entry.type === "user" || entry.type === "assistant_raw") && typeof entry.content === "string")
        .map((entry) => ({
        role: entry.type === "assistant_raw" ? "assistant" : entry.role ?? "user",
        content: entry.content,
    }));
}

export function latestSessionFile(): string | undefined {
    const all = listSessions();
    return all.length > 0 ? all[0].file : undefined;
}

function summarize(id: string, file: string, entries: any[]): SessionSummary {
    let cwd = "";
    let providerId = "";
    let model = "";
    let turns = 0;
    let activeFiles: ActiveFile[] = [];
    let messages = 0;
    let lastTs = 0;
    for (const entry of entries) {
        if (typeof entry.ts === "number")
            lastTs = entry.ts;
        if (entry.type === "session_start") {
            cwd = typeof entry.cwd === "string" ? entry.cwd : cwd;
            providerId = typeof entry.providerId === "string" ? entry.providerId : providerId;
            model = typeof entry.model === "string" ? entry.model : model;
        }
        else if (entry.type === "message") {
            messages += 1;
        }
        else if (entry.type === "checkpoint") {
            cwd = typeof entry.cwd === "string" ? entry.cwd : cwd;
            providerId = typeof entry.providerId === "string" ? entry.providerId : providerId;
            model = typeof entry.model === "string" ? entry.model : model;
            if (typeof entry.turn === "number")
                turns = entry.turn;
            if (Array.isArray(entry.activeFiles))
                activeFiles = entry.activeFiles;
        }
    }
    return { id, file, cwd, providerId, model, turns, activeFiles, messages, lastTs };
}

function readLastEntry(file: string): any | undefined {
    let size = 0;
    try {
        size = statSync(file).size;
    }
    catch {
        return undefined;
    }
    if (size === 0)
        return undefined;
    const length = Math.min(size, 64 * 1024);
    const fd = openSync(file, "r");
    try {
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, size - length);
        const lines = buffer.toString("utf8").trimEnd().split(NL);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            if (!lines[i])
                continue;
            try {
                return JSON.parse(lines[i]);
            }
            catch {
                return { type: "unparsable_tail" };
            }
        }
        return undefined;
    }
    finally {
        closeSync(fd);
    }
}

export function findUnclosedSessions(): SessionSummary[] {
    const { sessions } = getPaths();
    if (!existsSync(sessions))
        return [];
    const files = readdirSync(sessions)
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => {
            const file = join(sessions, name);
            let modified = 0;
            try {
                modified = statSync(file).mtimeMs;
            }
            catch {
                // unreadable
            }
            return { name, file, modified };
        })
        .sort((a, b) => b.modified - a.modified);
    const out: SessionSummary[] = [];
    for (const entry of files) {
        const last = readLastEntry(entry.file);
        if (!last || last.type === "session_end")
            continue;
        let entries: any[];
        try {
            entries = readSession(entry.file);
        }
        catch {
            continue;
        }
        if (entries.length === 0 || !entries.some((item) => item.type === "session_start"))
            continue;
        out.push(summarize(entry.name.replace(/[.]jsonl$/, ""), entry.file, entries));
    }
    return out;
}

export function latestUnclosedSession(): SessionSummary | undefined {
    return findUnclosedSessions()[0];
}

function ensureProjection(file: string): void {
    // Always refresh from the facts that still exist: a projection written at
    // an earlier checkpoint may be stale by the time we close or prune. If the
    // JSONL is already gone, leave the verified projection untouched.
    const entries = readSession(file);
    if (entries.length === 0)
        return;
    writeProjection(file, buildProjection(entries), entries);
}

export function pruneSessions(limit = sessionCacheLimitBytes()): number {
    const all = listSessions();
    let total = all.reduce((sum, entry) => sum + entry.bytes, 0);
    for (let i = all.length - 1; i >= 0 && total > limit; i -= 1) {
        try {
            ensureProjection(all[i].file);
            for (const ref of summaryRefsForFile(all[i].file))
                removeSummaryFile(ref);
            removeRawOutputsForSession(all[i].file);
            rmSync(all[i].file, { force: true });
            total -= all[i].bytes;
        }
        catch {
            // keep pruning the rest
        }
    }
    return total;
}

function summaryRefsForFile(file: string): string[] {
    try {
        return Array.from(new Set(readSession(file)
            .filter((fact) => fact?.type === "compacted")
            .map((fact) => fact.summaryRef)
            .filter((ref): ref is string => typeof ref === "string" && ref.length > 0)));
    }
    catch {
        return [];
    }
}
