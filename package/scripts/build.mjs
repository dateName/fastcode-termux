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

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);
const entry = join(pkgRoot, "src", "index.ts");
const outfile = join(pkgRoot, "dist", "cli.js");
const minify = !process.argv.includes("--no-minify");

mkdirSync(join(pkgRoot, "dist"), { recursive: true });

// ink lazily pulls in `react-devtools-core` (a dev-only optional dep) from
// devtools.js. We never enable devtools, so stub it to keep the bundle
// fully self-contained.
const stubOptionalDeps = {
  name: "stub-optional-deps",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({
      path: args.path,
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents:
        "const noop=()=>{};export const connectToDevTools=noop;export default{connectToDevTools:noop};",
      loader: "js",
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile,
  external: ["node:*"],
  // The entry (src/index.ts) already starts with `#!/usr/bin/env node`;
  // esbuild preserves it, so no banner is needed here.
  plugins: [stubOptionalDeps],
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
