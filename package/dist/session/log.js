/**
 * Append-only JSONL session log.
 *
 * Every entry is flushed as its own line, so a crash (or a kill from the
 * Android task switcher) still leaves a readable transcript that can be
 * resumed. A size cap keeps the sessions directory bounded; the oldest logs are
 * pruned first.
 *
 *   FASTCODE_SESSION_LOG=0        disable logging
 *   FASTCODE_SESSION_CACHE_MB=N   sessions cache cap in MB (default 64)
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPaths } from "../config/paths.js";
const NL = String.fromCharCode(10);
export function sessionCacheLimitBytes() {
    const mb = Number(process.env["FASTCODE_SESSION_CACHE_MB"]);
    return (Number.isFinite(mb) && mb > 0 ? mb : 64) * 1024 * 1024;
}
export function loggingEnabled() {
    return process.env["FASTCODE_SESSION_LOG"] !== "0";
}
function newId() {
    return new Date().toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
}
function openLog(id, file, meta) {
    let closed = false;
    const append = (entry) => {
        if (closed || !loggingEnabled())
            return;
        try {
            appendFileSync(file, JSON.stringify({ ts: Date.now(), ...entry }) + NL, "utf8");
        }
        catch {
            // A read-only or full filesystem must not break the TUI.
        }
    };
    append({ type: "session_start", id, cwd: process.cwd(), ...meta });
    return {
        id,
        file,
        append,
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
export function createSessionLog(meta = {}) {
    const { sessions } = getPaths();
    mkdirSync(sessions, { recursive: true });
    const id = newId();
    const file = join(sessions, id + ".jsonl");
    return openLog(id, file, meta);
}
export function openSessionLog(file) {
    const { sessions } = getPaths();
    mkdirSync(sessions, { recursive: true });
    return openLog(undefined, existsSync(file) ? file : join(sessions, file), {});
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
            messages = readFileSync(file, "utf8").split(NL).filter((line) => line.includes('"type":"message"')).length;
        }
        catch {
            // unreadable: report what we have
        }
        return { id: name.replace(/[.]jsonl$/, ""), file, bytes, modified, messages };
    })
        .sort((a, b) => (a.modified < b.modified ? 1 : -1));
}
export function resolveSessionFile(idOrFile) {
    const { sessions } = getPaths();
    const looksLikePath = idOrFile.includes("/") || idOrFile.includes(String.fromCharCode(92)) || idOrFile.endsWith(".jsonl");
    return looksLikePath ? idOrFile : join(sessions, idOrFile + ".jsonl");
}
export function readSession(idOrFile) {
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
export function loadSessionMessages(idOrFile) {
    return readSession(idOrFile)
        .filter((entry) => entry.type === "message" && typeof entry.content === "string")
        .map((entry) => ({ role: entry.role, content: entry.content }));
}
export function latestSessionFile() {
    const all = listSessions();
    return all.length > 0 ? all[0].file : undefined;
}
export function pruneSessions(limit = sessionCacheLimitBytes()) {
    const all = listSessions();
    let total = all.reduce((sum, entry) => sum + entry.bytes, 0);
    for (let i = all.length - 1; i >= 0 && total > limit; i -= 1) {
        try {
            rmSync(all[i].file, { force: true });
            total -= all[i].bytes;
        }
        catch {
            // keep pruning the rest
        }
    }
    return total;
}
