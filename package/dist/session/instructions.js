import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { getPaths } from "../config/paths.js";
const FILE_NAMES = ["AGENTS.md", "FASTCODE.md"];
const MAX_FILE_BYTES = 32 * 1024;
const MAX_TOTAL_CHARS = 96 * 1024;
function clipUtf8(text, maxBytes) {
    const buffer = Buffer.from(text, "utf8");
    if (buffer.length <= maxBytes)
        return text;
    let end = Math.max(0, maxBytes);
    while (end > 0 && (buffer[end] & 0xc0) === 0x80)
        end -= 1;
    return buffer.subarray(0, end).toString("utf8");
}
function projectRoot(cwd) {
    let current = resolve(cwd);
    for (;;) {
        if (existsSync(join(current, ".git")) || existsSync(join(current, "package.json")))
            return current;
        const parent = dirname(current);
        if (parent === current)
            return resolve(cwd);
        current = parent;
    }
}
function readEntry(file, scope) {
    try {
        if (!statSync(file).isFile())
            return undefined;
        const content = readFileSync(file, "utf8");
        const truncated = Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES;
        return {
            path: file,
            scope,
            content: truncated ? `${clipUtf8(content, MAX_FILE_BYTES)}\n[... instruction file truncated ...]` : content,
            truncated,
        };
    }
    catch {
        return undefined;
    }
}
function readFromDir(dir, scope, seen) {
    const entries = [];
    for (const name of FILE_NAMES) {
        const file = join(dir, name);
        const resolved = resolve(file);
        if (seen.has(resolved))
            continue;
        const entry = readEntry(file, scope);
        if (!entry)
            continue;
        seen.add(resolved);
        entries.push(entry);
    }
    return entries;
}
/** Discover instruction files from the global data dir, project root and cwd chain. */
export function discoverInstructions(cwd = process.cwd()) {
    const entries = [];
    const seen = new Set();
    const home = getPaths().root;
    entries.push(...readFromDir(home, "global", seen));
    const root = projectRoot(cwd);
    const chain = [];
    let current = resolve(cwd);
    for (;;) {
        chain.push(current);
        if (current === root)
            break;
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    chain.reverse();
    for (const dir of chain)
        entries.push(...readFromDir(dir, dir === root ? "project" : "local", seen));
    const layered = new Map();
    for (const entry of entries) {
        const key = basename(entry.path);
        layered.delete(key);
        layered.set(key, entry);
    }
    let total = 0;
    const bounded = [];
    for (const entry of layered.values()) {
        if (total >= MAX_TOTAL_CHARS)
            break;
        const room = MAX_TOTAL_CHARS - total;
        const content = entry.content.length > room
            ? `${entry.content.slice(0, room)}\n[... total instruction budget exceeded ...]`
            : entry.content;
        bounded.push({ ...entry, content, truncated: entry.truncated || content.length < entry.content.length });
        total += content.length;
    }
    const text = formatInstructionPrompt(bounded);
    return {
        entries: bounded,
        text,
        hash: createHash("sha256").update(text).digest("hex"),
    };
}
export function formatInstructionPrompt(entries) {
    if (entries.length === 0)
        return "";
    const blocks = entries.map((entry) => `### ${entry.scope}: ${entry.path}\n${entry.content.trim()}`.trim());
    return ["## Repository instructions", ...blocks].join("\n\n");
}
