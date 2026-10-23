import { open, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { createIgnore, isBinaryName } from "../ignore.js";
import { createOutputBuffer } from "../limits.js";
import { allowedRoots, isInsideAny, realpathOf, sandboxPath } from "./paths.js";

export async function readMany(cwd: string, paths: string[]): Promise<string> {
    const blocks: string[] = [];
    for (const path of paths) {
        const file = sandboxPath(cwd, path);
        blocks.push(`### ${file}\n${await readTextFile(file)}`);
    }
    return blocks.join("\n\n");
}

const CODE_EXT = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java",
    ".rb", ".php", ".cs", ".c", ".h", ".cpp", ".hpp", ".kt", ".swift", ".scala",
    ".sh", ".lua", ".ex", ".exs", ".dart", ".vue", ".svelte",
]);

export async function listFiles(sandbox: string, root: string, maxDepth: number, detail: boolean): Promise<string> {
    const out = createOutputBuffer();
    const ignore = createIgnore(sandbox);
    if (detail) {
        await walkWithin(sandbox, root, maxDepth, async (file, info) => {
            out.line((info.isDirectory() ? "dir " : "file") + " " + file);
            return !out.full;
        });
        return out.value();
    }
    async function visitDir(dir: string, depth: number, label: string): Promise<void> {
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
                line += `  — ${symbols}`;
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

async function fileSymbols(file: string, name: string, size: number): Promise<string> {
    if (size > 256 * 1024 || !CODE_EXT.has(extname(name).toLowerCase()))
        return "";
    try {
        const text = await readTextFile(file, 64 * 1024);
        const names = new Set<string>();
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

function indent(depth: number): string {
    return "  ".repeat(depth);
}

export function formatSize(bytes: number): string {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function grepFiles(sandbox: string, root: string, pattern: string, maxDepth: number): Promise<string> {
    const re = new RegExp(pattern, "i");
    const out = createOutputBuffer();
    const maxBytes = grepMaxBytes();
    await walkWithin(sandbox, root, maxDepth, async (file, info) => {
        if (!info.isFile())
            return;
        if (isBinaryName(basename(file)))
            return;
        if (info.size > maxBytes) {
            out.line(`${file}: skipped (${formatSize(info.size)} exceeds ${formatSize(maxBytes)})`);
            return !out.full;
        }
        try {
            const text = await readTextFile(file, maxBytes);
            const lines = text.split(/\r?\n/);
            lines.forEach((line, index) => {
                if (re.test(line))
                    out.line(file + ":" + (index + 1) + ": " + line);
            });
        }
        catch {
            // Binary or unreadable files are skipped.
        }
        return !out.full;
    });
    return out.value();
}

export async function readTextFile(file: string, limit = readMaxBytes()): Promise<string> {
    const info = await stat(file);
    if (!info.isFile())
        throw new Error(`not a file: ${file}`);
    const length = Math.min(info.size, limit);
    const handle = await open(file, "r");
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        const slice = buffer.subarray(0, bytesRead);
        if (slice.subarray(0, Math.min(8192, slice.length)).includes(0))
            return `[binary file omitted: ${file} (${info.size} bytes)]`;
        const text = slice.toString("utf8");
        return info.size > length
            ? `${text}\n[... truncated at ${length} of ${info.size} bytes; use grep or read a narrower file ...]`
            : text;
    }
    finally {
        await handle.close();
    }
}

export function readMaxBytes(): number {
    const raw = Number(process.env["FASTCODE_READ_MAX_BYTES"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200_000;
}

function grepMaxBytes(): number {
    const raw = Number(process.env["FASTCODE_GREP_MAX_BYTES"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1_000_000;
}

async function walkWithin(sandbox: string, root: string, maxDepth: number, visit: (file: string, info: any) => Promise<boolean | void>): Promise<void> {
    const roots = allowedRoots(sandbox).map((entry) => realpathOf(entry)).filter(Boolean) as string[];
    const ignore = createIgnore(sandbox);
    await walk(root, maxDepth, visit, 0, { roots, visited: 0, maxVisited: 5000, ignore }, []);
}

async function walk(node: string, maxDepth: number, visit: (file: string, info: any) => Promise<boolean | void>, depth = 0, state: any, chain: string[] = []): Promise<boolean | void> {
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
    let keepGoing: boolean | void = true;
    try {
        keepGoing = await visit(node, info);
    }
    catch {
        // A visitor failure must not abort the surrounding walk.
    }
    if (keepGoing === false)
        return false;
    if (!info.isDirectory() || depth >= maxDepth || !insideSandbox)
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
