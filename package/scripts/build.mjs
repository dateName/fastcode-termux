#!/usr/bin/env node
/**
 * esbuild bundle: src/index.ts -> dist/cli.js (self-contained, committed to git).
 *
 * The single output file inlines every runtime dependency (Ink, React, meow,
 * yoga-wasm base64, ...), so a plain `git clone` can run FastCode without any
 * `npm install`. Node builtins stay external.
 *
 * Usage:
 *   node scripts/build.mjs             # minified bundle
 *   node scripts/build.mjs --no-minify # readable bundle (debugging)
 */
import * as esbuild from "esbuild";
import { chmodSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stubOptionalDeps, createInlineCfontsFonts, bannerJs } from "./esbuild-plugins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);
const entry = join(pkgRoot, "src", "index.ts");
const outfile = join(pkgRoot, "dist", "cli.js");
const minify = !process.argv.includes("--no-minify");

mkdirSync(join(pkgRoot, "dist"), { recursive: true });

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile,
  external: ["node:*"],
  banner: { js: bannerJs },
  plugins: [stubOptionalDeps, createInlineCfontsFonts(pkgRoot)],
  minify,
  sourcemap: false,
  treeShaking: true,
  legalComments: "none",
  metafile: true,
  logLevel: "info",
});

try {
  chmodSync(outfile, 0o755);
} catch {
  /* best effort on Windows */
}

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`✅ built ${outfile} (${(bytes / 1024 / 1024).toFixed(2)} MB, minify=${minify})`);
