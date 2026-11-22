#!/usr/bin/env node
/**
 * List every text-file line that contains the current package version.
 *
 * Usage (from the repo root):
 *   node scripts/version-anchors.mjs
 *   node scripts/version-anchors.mjs --version 0.0.0-example
 *   node scripts/version-anchors.mjs --json
 *
 * The package version in package/package.json is the single source of truth.
 * This helper is read-only; it never edits a file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const pkgDir = join(repo, "package");
const workspace = dirname(repo);
const args = process.argv.slice(2);
const json = args.includes("--json");
const versionArg = args.find((arg) => arg.startsWith("--version="))?.split("=")[1]
    ?? (args.includes("--version") ? args[args.indexOf("--version") + 1] : undefined);
const version = versionArg ?? JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

const textExtensions = new Set([".md", ".json", ".mjs", ".cjs", ".js", ".ts", ".tsx", ".sh", ".yml", ".yaml", ".txt"]);
const skipDirs = new Set([".git", "node_modules", "release", "refs", ".tmp-home", ".cache"]);
const outerDocs = ["AGENTS.md", "NOW.md", "PROJECT_INDEX.md", "RUNBOOK.md", "脑图.md"];
const versionPattern = new RegExp(`(?<![0-9.-])${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9.-])`);
const hits = [];
const seen = new Set();

function scan(file) {
    const rel = relative(workspace, file).replace(/\\/g, "/");
    if (seen.has(rel))
        return;
    seen.add(rel);
    let text;
    try {
        text = readFileSync(file, "utf8");
    }
    catch {
        return;
    }
    if (!versionPattern.test(text))
        return;
    text.split(/\r?\n/).forEach((line, index) => {
        if (versionPattern.test(line))
            hits.push({ file: rel, line: index + 1, text: line.trim() });
    });
}

function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!skipDirs.has(entry.name))
                walk(full);
            continue;
        }
        const dot = entry.name.lastIndexOf(".");
        if (dot < 0 || !textExtensions.has(entry.name.slice(dot)))
            continue;
        scan(full);
    }
}

walk(repo);
for (const name of outerDocs)
    scan(join(workspace, name));

if (json) {
    console.log(JSON.stringify({ version, count: hits.length, hits }, null, 2));
}
else {
    console.log(`version ${version}: ${hits.length} anchor line(s)`);
    for (const hit of hits)
        console.log(`${hit.file}:${hit.line}: ${hit.text}`);
}
