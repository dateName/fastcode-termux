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
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { basename, join } from "node:path";
import { getPaths } from "../config/paths.js";

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

export function sessionCacheLimitBytes(): number {
    const mb = Number(process.env["FASTCODE_SESSION_CACHE_MB"]);
    return (Number.isFinite(mb) && mb > 0 ? mb : 256) * 1024 * 1024;
}

export function loggingEnabled(): boolean {
    return process.env["FASTCODE_SESSION_LOG"] !== "0";
}

export function projectionPath(file: string): string {
    return file.replace(/[.]jsonl$/, ".projection.json");
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
        appendFileSync(file, line, "utf8");
        return;
    }
    const fd = openSync(file, "a");
    try {
        writeSync(fd, line);
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
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
        catch {
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
        close() {
            append({ type: "session_end" });
            closed = true;
            try {
                pruneSessions();
            }
            catch {
                // best effort
            }
        },
    };
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
    return readdirSync(sessions)
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => {
            const file = join(sessions, name);
            let bytes = 0;
            let modified = "";
            let messages = 0;
            try {
                const info = statSync(file);
                bytes = info.size;
                modified = info.mtime.toISOString();
                messages = readFileSync(file, "utf8").split(NL).filter((line) =>
                    line.includes('"type":"user"') ||
                    (line.includes('"type":"message"') && line.includes('"role":"user"'))).length;
            }
            catch {
                // unreadable: report what we have
            }
            return { id: name.replace(/[.]jsonl$/, ""), file, bytes, modified, messages };
        })
        .sort((a, b) => (a.modified < b.modified ? 1 : -1));
}

export function resolveSessionFile(idOrFile: string): string {
    const { sessions } = getPaths();
    const looksLikePath = idOrFile.includes("/") || idOrFile.includes(String.fromCharCode(92)) || idOrFile.endsWith(".jsonl");
    return looksLikePath ? idOrFile : join(sessions, idOrFile + ".jsonl");
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
    const target = projectionPath(file);
    if (existsSync(target))
        return;
    const entries = readSession(file);
    if (entries.length === 0)
        return;
    const summary = summarize(basename(file).replace(/[.]jsonl$/, ""), file, entries);
    const lastUser = [...entries].reverse().find((entry) => entry.type === "message" && entry.role === "user");
    const lastAssistant = [...entries].reverse().find((entry) => entry.type === "message" && entry.role === "assistant");
    const payload = {
        version: 1,
        kind: "pruned_session",
        source: basename(file),
        createdAt: new Date().toISOString(),
        summary: {
            cwd: summary.cwd,
            providerId: summary.providerId,
            model: summary.model,
            turns: summary.turns,
            messages: summary.messages,
            activeFiles: summary.activeFiles.slice(0, 200),
            lastUser: typeof lastUser?.content === "string" ? lastUser.content.slice(0, 2000) : "",
            lastAssistant: typeof lastAssistant?.content === "string" ? lastAssistant.content.slice(0, 2000) : "",
        },
    };
    writeFileSync(target, JSON.stringify(payload, null, 2), "utf8");
}

export function pruneSessions(limit = sessionCacheLimitBytes()): number {
    const all = listSessions();
    let total = all.reduce((sum, entry) => sum + entry.bytes, 0);
    for (let i = all.length - 1; i >= 0 && total > limit; i -= 1) {
        try {
            ensureProjection(all[i].file);
            rmSync(all[i].file, { force: true });
            total -= all[i].bytes;
        }
        catch {
            // keep pruning the rest
        }
    }
    return total;
}
