#!/usr/bin/env node
/**
 * Verify that the committed bundle and the tsc output both contain the
 * runtime string markers for the sensitive-file guard.
 *
 * Type names are erased by tsc/esbuild, so this intentionally checks only
 * string literals that survive at runtime (error codes, reasons, markers).
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const requiredMarkers = [
    "critical-credential-read",
    "sensitive_file_egress",
    "sensitive-file-upload",
    "move_sensitive",
    "truncate_sensitive",
];
const artifacts = ["dist/cli.js", "dist/agent/guards.js"];
let failed = false;

for (const relative of artifacts) {
    const file = join(pkgDir, relative);
    let text;
    try {
        text = readFileSync(file, "utf8");
    }
    catch (error) {
        console.error(`FAIL ${relative}: ${error instanceof Error ? error.message : String(error)}`);
        failed = true;
        continue;
    }
    const missing = requiredMarkers.filter((marker) => !text.includes(marker));
    if (missing.length > 0) {
        console.error(`FAIL ${relative}: missing runtime markers: ${missing.join(", ")}`);
        failed = true;
    }
    else {
        console.log(`PASS ${relative}: ${requiredMarkers.length} guard markers present`);
    }
}

try {
    const size = statSync(join(pkgDir, "dist/cli.js")).size;
    if (size < 500 * 1024) {
        console.error(`FAIL dist/cli.js is too small for the bundle (${size} bytes)`);
        failed = true;
    }
    else {
        console.log(`PASS dist/cli.js bundle size: ${size} bytes`);
    }
}
catch {
    console.error("FAIL dist/cli.js is missing");
    failed = true;
}

if (failed) {
    console.error("artifact verification failed");
    process.exit(1);
}
console.log("artifact verification passed");
