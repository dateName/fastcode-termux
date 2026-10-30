#!/usr/bin/env node
/**
 * Copy only the dependency closure needed by `scripts/smoke-test.mjs`.
 *
 * The runtime `dist/cli.js` is a self-contained bundle, but smoke loads dist
 * modules directly. `agent/shell-ast.js` imports `bash-parser`, so the
 * portable package needs that closure when smoke is run on a device.
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [, , pkgRoot, targetRoot] = process.argv;
if (!pkgRoot || !targetRoot) {
    console.error("usage: copy-smoke-deps.mjs <package-root> <target-package-root>");
    process.exit(1);
}
const sourceModules = join(pkgRoot, "node_modules");
const targetModules = join(targetRoot, "node_modules");
const seen = new Set();

function walk(name) {
    if (seen.has(name))
        return;
    seen.add(name);
    const source = join(sourceModules, name);
    const manifest = join(source, "package.json");
    if (!existsSync(manifest)) {
        console.error("missing dependency: " + name);
        return;
    }
    cpSync(source, join(targetModules, name), { recursive: true, force: true });
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    for (const dependency of Object.keys(pkg.dependencies ?? {}))
        walk(dependency);
}

mkdirSync(targetModules, { recursive: true });
walk("bash-parser");
console.log("copied smoke deps: " + [...seen].sort().join(", "));
