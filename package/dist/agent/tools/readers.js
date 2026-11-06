import { createReadStream } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import readline from "node:readline";
import { createIgnore, isBinaryName } from "../ignore.js";
import { createOutputBuffer } from "../limits.js";
import { allowedRoots, isInsideAny, realpathOf, sandboxPath } from "./paths.js";
export async function readManyResult(cwd, paths, maxBytes = readManyMaxBytes()) {
    const blocks = [];
    let used = 0;
    let totalBytes = 0;
    let filesRead = 0;
    let truncated = false;
    for (const path of paths) {
        if (used >= maxBytes) {
            truncated = true;
            break;
        }
        const file = sandboxPath(cwd, path);
        const result = await readTextFileResult(file, maxBytes - used);
        totalBytes += result.totalBytes;
        const block = `### ${file}\n${result.text}`;
        const blockBytes = Buffer.byteLength(block, "utf8");
        if (used + blockBytes > maxBytes) {
            const allowed = Math.max(0, maxBytes - used);
            const clipped = Buffer.from(block, "utf8").subarray(0, allowed).toString("utf8");
            blocks.push(`${clipped}\n[... read_many budget exhausted at ${maxBytes} bytes ...]`);
            used = maxBytes;
            filesRead += 1;
            truncated = true;
            break;
        }
        blocks.push(block);
        used += blockBytes;
        filesRead += 1;
        if (result.truncated)
            truncated = true;
    }
    if (filesRead < paths.length)
        truncated = true;
    return {
        text: blocks.join("\n\n"),
        truncated,
        totalBytes,
        returnedBytes: used,
        filesRead,
        filesSkipped: Math.max(0, paths.length - filesRead),
    };
}
export async function readMany(cwd, paths) {
    return (await readManyResult(cwd, paths)).text;
}
const CODE_EXT = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java",
    ".rb", ".php", ".cs", ".c", ".h", ".cpp", ".hpp", ".kt", ".swift", ".scala",
    ".sh", ".lua", ".ex", ".exs", ".dart", ".vue", ".svelte",
]);
export async function listFiles(sandbox, root, maxDepth, detail) {
    const out = createOutputBuffer();
    const ignore = createIgnore(sandbox);
    if (detail) {
        await walkWithin(sandbox, root, maxDepth, async (file, info) => {
            out.line((info.isDirectory() ? "dir " : "file") + " " + file);
            return !out.full;
        });
        return out.value();
    }
    async function visitDir(dir, depth, label) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            out.line(`${indent(depth)}${label}/  (unreadable)`);
            return;
        }
        entries = entries.filter((entry) => !ignore.ignored(entry.name, join(dir, entry.name), entry.isDirectory()));
        entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
        const dirs = entries.filter((entry) => entry.isDirectory());
        const files = entries.filter((entry) => entry.isFile());
        out.line(`${indent(depth)}${label}/  (${files.length} file${files.length === 1 ? "" : "s"}, ${dirs.length} dir${dirs.length === 1 ? "" : "s"})`);
        for (const entry of files) {
            const full = join(dir, entry.name);
            const info = await stat(full).catch(() => undefined);
            if (!info)
                continue;
            let line = `${indent(depth + 1)}${entry.name}  (${formatSize(info.size)})`;
            const symbols = await fileSymbols(full, entry.name, info.size);
            if (symbols)
                line += `  鈥?${symbols}`;
            out.line(line);
            if (out.full)
                return;
        }
        if (depth >= maxDepth)
            return;
        for (const entry of dirs) {
            await visitDir(join(dir, entry.name), depth + 1, entry.name);
            if (out.full)
                return;
        }
    }
    await visitDir(root, 0, basename(root) || ".");
    return out.value();
}
async function fileSymbols(file, name, size) {
    if (size > 256 * 1024 || !CODE_EXT.has(extname(name).toLowerCase()))
        return "";
    try {
        const text = await readTextFile(file, 64 * 1024);
        const names = new Set();
        const patterns = [
            /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|struct|trait|impl|def)\s+([A-Za-z_$][\w$]*)/g,
            /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g,
        ];
        for (const pattern of patterns) {
            for (const match of text.matchAll(pattern)) {
                names.add(match[1]);
                if (names.size >= 8)
                    break;
            }
        }
        return Array.from(names).slice(0, 8).join(", ");
    }
    catch {
        return "";
    }
}
function indent(depth) {
    return "  ".repeat(depth);
}
export function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export async function grepFiles(sandbox, root, options) {
    const re = new RegExp(options.pattern, options.flags ?? "i");
    const maxResults = Math.max(1, options.maxResults ?? 200);
    const context = Math.max(0, options.context ?? 0);
    const maxBytes = grepMaxBytes();
    const out = createOutputBuffer();
    const globRe = options.glob ? globToRegExp(options.glob) : undefined;
    let matchCount = 0;
    let filesScanned = 0;
    let truncated = false;
    await walkWithin(sandbox, root, options.maxDepth ?? 4, async (file, info) => {
        if (options.signal?.aborted)
            throw Object.assign(new Error("grep aborted"), { code: "ABORTED" });
        if (!info.isFile())
            return;
        if (isBinaryName(basename(file)))
            return;
        if (globRe) {
            const rel = relative(root, file).replace(/\\/g, "/");
            const target = options.glob && options.glob.includes("/") ? rel : basename(file);
            if (!globRe.test(target))
                return;
        }
        if (info.size > maxBytes) {
            out.line(`${file}: skipped (${formatSize(info.size)} exceeds ${formatSize(maxBytes)})`);
            return !out.full;
        }
        filesScanned += 1;
        try {
            const result = await readTextFileResult(file, maxBytes);
            if (result.binary)
                return;
            const lines = result.text.split(/\r?\n/);
            const printed = new Set();
            for (let index = 0; index < lines.length; index += 1) {
                if (!re.test(lines[index]))
                    continue;
                matchCount += 1;
                const start = Math.max(0, index - context);
                const end = Math.min(lines.length - 1, index + context);
                for (let cursor = start; cursor <= end; cursor += 1) {
                    if (printed.has(cursor) && cursor !== index)
                        continue;
                    printed.add(cursor);
                    const isMatch = cursor === index;
                    out.line(`${file}:${cursor + 1}${isMatch ? ": " : "- "}${lines[cursor]}`);
                    if (out.full) {
                        truncated = true;
                        return false;
                    }
                }
                if (matchCount >= maxResults) {
                    truncated = true;
                    return false;
                }
            }
        }
        catch (error) {
            if (error?.code === "ABORTED")
                throw error;
            // Binary or unreadable files are skipped.
        }
        return !out.full;
    });
    if (out.full)
        truncated = true;
    return { text: out.value(), truncated, matchCount, filesScanned };
}
function globToRegExp(glob) {
    let source = "^";
    for (let i = 0; i < glob.length; i += 1) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                source += ".*";
                i += 1;
                if (glob[i + 1] === "/")
                    i += 1;
            }
            else {
                source += "[^/]*";
            }
        }
        else if (char === "?") {
            source += "[^/]";
        }
        else if (/[.+^${}()|[\]\\]/.test(char)) {
            source += "\\" + char;
        }
        else {
            source += char;
        }
    }
    return new RegExp(source + "$", "i");
}
export async function readTextFileResult(file, limit = readMaxBytes()) {
    const info = await stat(file);
    if (!info.isFile())
        throw Object.assign(new Error(`not a file: ${file}`), { code: "EISDIR" });
    const length = Math.min(info.size, limit);
    const handle = await open(file, "r");
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        const slice = buffer.subarray(0, bytesRead);
        if (slice.subarray(0, Math.min(8192, slice.length)).includes(0)) {
            return {
                text: `[binary file omitted: ${file} (${info.size} bytes)]`,
                truncated: false,
                totalLines: undefined,
                returnedLines: 0,
                totalBytes: info.size,
                returnedBytes: 0,
                binary: true,
            };
        }
        const text = slice.toString("utf8");
        const truncated = info.size > length;
        const returnedLines = text ? text.split(/\r?\n/).length : 0;
        return {
            text,
            truncated,
            totalLines: truncated ? undefined : returnedLines,
            returnedLines,
            totalBytes: info.size,
            returnedBytes: Buffer.byteLength(text, "utf8"),
            binary: false,
        };
    }
    finally {
        await handle.close();
    }
}
export async function readFileRange(file, offset, limit, options = {}) {
    const info = await stat(file);
    if (!info.isFile())
        throw Object.assign(new Error(`not a file: ${file}`), { code: "EISDIR" });
    const probe = await readTextFileResult(file, 8192);
    if (probe.binary) {
        return {
            text: probe.text,
            truncated: false,
            totalLines: 0,
            returnedLines: 0,
            totalBytes: info.size,
            returnedBytes: 0,
            scannedAll: true,
            binary: true,
        };
    }
    const start = Math.max(1, Math.floor(offset));
    const count = Math.max(1, Math.floor(limit));
    const maxBytes = options.maxBytes ?? readMaxBytes();
    const scanMaxBytes = options.scanMaxBytes ?? readScanMaxBytes();
    const collected = [];
    let lineNo = 0;
    let returnedBytes = 0;
    let totalBytes = 0;
    let truncated = false;
    let scannedAll = true;
    let sawRange = false;
    const stream = createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
        for await (const line of lines) {
            if (options.signal?.aborted)
                throw Object.assign(new Error("read aborted"), { code: "ABORTED" });
            lineNo += 1;
            totalBytes += Buffer.byteLength(line, "utf8") + 1;
            if (lineNo >= start && collected.length < count) {
                sawRange = true;
                collected.push(line);
                returnedBytes += Buffer.byteLength(line, "utf8") + 1;
                if (returnedBytes > maxBytes) {
                    truncated = true;
                    scannedAll = false;
                    break;
                }
            }
            else if (lineNo > start + count - 1) {
                truncated = true;
            }
            if (totalBytes > scanMaxBytes) {
                truncated = true;
                scannedAll = false;
                break;
            }
        }
    }
    finally {
        lines.close();
        stream.destroy();
    }
    return {
        text: collected.join("\n"),
        truncated,
        totalLines: lineNo,
        returnedLines: sawRange ? collected.length : 0,
        totalBytes: info.size,
        returnedBytes,
        scannedAll,
        binary: false,
    };
}
export async function readTextFile(file, limit = readMaxBytes()) {
    const result = await readTextFileResult(file, limit);
    return result.truncated
        ? `${result.text}\n[... truncated at ${result.returnedBytes} of ${result.totalBytes} bytes; use read_file offset/limit, grep, or a narrower file ...]`
        : result.text;
}
export function readMaxBytes() {
    const raw = Number(process.env["FASTCODE_READ_MAX_BYTES"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200_000;
}
export function grepMaxBytes() {
    const raw = Number(process.env["FASTCODE_GREP_MAX_BYTES"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1_000_000;
}
export function readScanMaxBytes() {
    const raw = Number(process.env["FASTCODE_READ_SCAN_MAX_BYTES"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8_000_000;
}
export function readManyMaxBytes() {
    const raw = Number(process.env["FASTCODE_READ_MANY_MAX_BYTES"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 400_000;
}
async function walkWithin(sandbox, root, maxDepth, visit) {
    const roots = allowedRoots(sandbox).map((entry) => realpathOf(entry)).filter(Boolean);
    const ignore = createIgnore(sandbox);
    await walk(root, maxDepth, visit, 0, { roots, visited: 0, maxVisited: 5000, ignore }, []);
}
async function walk(node, maxDepth, visit, depth = 0, state, chain = []) {
    if (state.visited >= state.maxVisited)
        return;
    let info;
    try {
        info = await stat(node);
    }
    catch {
        return;
    }
    let real;
    try {
        real = await realpathOf(node) ?? node;
    }
    catch {
        real = node;
    }
    if (chain.includes(real))
        return;
    state.visited += 1;
    const insideSandbox = !state.roots || state.roots.length === 0 || isInsideAny(real, state.roots);
    if (!insideSandbox)
        return;
    let keepGoing = true;
    try {
        keepGoing = await visit(node, info);
    }
    catch {
        // A visitor failure must not abort the surrounding walk.
    }
    if (keepGoing === false)
        return false;
    if (!info.isDirectory() || depth >= maxDepth)
        return;
    let entries;
    try {
        entries = await readdir(node, { withFileTypes: true });
    }
    catch {
        return;
    }
    const nextChain = chain.concat(real);
    for (const entry of entries) {
        if (state.ignore?.ignored(entry.name, join(node, entry.name), entry.isDirectory()))
            continue;
        if (state.visited >= state.maxVisited)
            return;
        try {
            const keepWalking = await walk(join(node, entry.name), maxDepth, visit, depth + 1, state, nextChain);
            if (keepWalking === false)
                return false;
        }
        catch {
            // Keep walking siblings.
        }
    }
}
