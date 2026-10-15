#!/usr/bin/env node
// FastCode CLI shim — resolves to the built ESM entrypoint.
// Keeps the bin file tiny so npm postinstall stays cheap.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, "..", "dist", "index.js");
const srcEntry = [join(here, "..", "src", "index.ts"), join(here, "..", "src", "index.tsx")].find((p) => existsSync(p));

if (existsSync(distEntry)) {
  await import(pathToFileURL(distEntry).href);
} else if (existsSync(srcEntry)) {
  // Local dev fallback — let users `node ./bin/fastcode.mjs` from the repo
  const { register } = await import("node:module");
  try {
    register("tsx/esm", import.meta.url);
    await import(pathToFileURL(srcEntry).href);
  } catch {
    console.error(
      "FastCode is not built and tsx is unavailable. Run `npm run build` first."
    );
    process.exit(1);
  }
} else {
  console.error("FastCode build artifacts not found. Did you run `npm run build`?");
  process.exit(1);
}
