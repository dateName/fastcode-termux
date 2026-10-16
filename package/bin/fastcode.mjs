#!/usr/bin/env node
// FastCode CLI shim.
//
// Resolution order:
//   1. dist/cli.js   — self-contained esbuild bundle (committed to git: works
//                      after a plain `git clone`, no `npm install` required)
//   2. dist/index.js — tsc output (needs node_modules)
//   3. src/index.ts  — dev fallback via tsx
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const bundleEntry = join(here, "..", "dist", "cli.js");
const distEntry = join(here, "..", "dist", "index.js");
const srcEntry = [join(here, "..", "src", "index.ts"), join(here, "..", "src", "index.tsx")].find((p) => existsSync(p));

const MISSING_DEPS_HELP = `
╭─────────────────────────────────────────────╮
│  ⚠️  FastCode 缺少依赖包                      │
╰─────────────────────────────────────────────╯

请选择以下任一方式修复：

  【方式一】一键安装（推荐）
    bash scripts/install.sh

  【方式二】手动安装依赖
    cd package && npm install

  【方式三】下载便携版
    https://github.com/dateName/fastcode-termux/releases
`;

async function run() {
  try {
    if (existsSync(bundleEntry)) {
      await import(pathToFileURL(bundleEntry).href);
    } else if (existsSync(distEntry)) {
      await import(pathToFileURL(distEntry).href);
    } else if (srcEntry) {
      // Local dev fallback — let users `node ./bin/fastcode.mjs` from the repo
      const { register } = await import("node:module");
      register("tsx/esm", import.meta.url);
      await import(pathToFileURL(srcEntry).href);
    } else {
      console.error("FastCode build artifacts not found. Did you run `npm run build`?");
      process.exit(1);
    }
  } catch (err) {
    if (err && err.code === "ERR_MODULE_NOT_FOUND") {
      console.error(MISSING_DEPS_HELP);
      process.exit(1);
    }
    throw err;
  }
}

run();
