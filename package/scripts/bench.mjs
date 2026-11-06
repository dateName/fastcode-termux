#!/usr/bin/env node
/**
 * Lightweight performance baseline. Run after `npm run build`.
 *
 *   npm run bench
 *
 * The numbers are machine-specific; compare them against the recorded baseline
 * on the same platform, not across platforms.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const home = mkdtempSync(join(tmpdir(), "fastcode-bench-home-"));
const dir = mkdtempSync(join(tmpdir(), "fastcode-bench-"));
process.env.FASTCODE_HOME = home;
process.env.FASTCODE_TRUST_ALL = "1";

const tools = await import(pathToFileURL(join(pkgDir, "dist", "agent", "tools.js")).href);
const meta = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

async function measure(fn) {
    const started = performance.now();
    const value = await fn();
    return { ms: Number((performance.now() - started).toFixed(2)), value };
}

try {
    const cold = [];
    for (let index = 0; index < 3; index += 1) {
        const started = performance.now();
        execFileSync(process.execPath, [join(pkgDir, "bin", "fastcode.mjs"), "--version"], { cwd: pkgDir, stdio: "ignore" });
        cold.push(performance.now() - started);
    }

    const write = await measure(() => tools.runAgentTool({ tool: "write_file", path: "big.txt", content: "x".repeat(200_000) }, dir));

    const manyDir = join(dir, "many");
    mkdirSync(manyDir, { recursive: true });
    const manyPaths = [];
    for (let index = 0; index < 10; index += 1) {
        const file = join(manyDir, `f${index}.txt`);
        writeFileSync(file, "y".repeat(200_000), "utf8");
        manyPaths.push(`many/f${index}.txt`);
    }
    const readMany = await measure(() => tools.runAgentTool({ tool: "read_many", paths: manyPaths, maxBytes: 2_000_000 }, dir));

    const listDir = join(dir, "list");
    mkdirSync(listDir, { recursive: true });
    for (let index = 0; index < 1000; index += 1)
        writeFileSync(join(listDir, `f${index}.txt`), index === 0 ? "needle\n" : "x\n", "utf8");
    const list = await measure(() => tools.runAgentTool({ tool: "list_files", path: "list", maxDepth: 1 }, dir));
    const grep = await measure(() => tools.runAgentTool({ tool: "grep", pattern: "needle", path: "list", maxDepth: 1, maxResults: 50 }, dir));

    const result = {
        version: meta.version,
        platform: process.platform,
        node: process.version,
        coldStartMs: Number((cold.reduce((sum, value) => sum + value, 0) / cold.length).toFixed(2)),
        write200kMs: write.ms,
        readMany10x200kMs: readMany.ms,
        list1000Ms: list.ms,
        grep1000Ms: grep.ms,
        writeOk: write.value.ok,
        readManyOk: readMany.value.ok,
        listOk: list.value.ok,
        grepOk: grep.value.ok,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
}
