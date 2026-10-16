/**
 * Read this package's package.json (name + version) from any layout.
 *
 * The same source runs three ways, so `import.meta.url` points at different
 * depths; try every plausible relative path and fall back gracefully.
 *
 *   - tsx / dev:    src/lib/pkg.ts        -> ../../package.json
 *   - tsc output:   dist/lib/pkg.js       -> ../../package.json
 *   - esbuild bundle: dist/cli.js         -> ../package.json
 */
import { readFileSync } from "node:fs";

export interface PackageMeta {
    name: string;
    version: string;
}

const FALLBACK: PackageMeta = { name: "@simplelittledev/fastcode", version: "0.0.0" };

const CANDIDATES = ["../package.json", "../../package.json", "../../../package.json"];

export function readPackageMeta(): PackageMeta {
    for (const rel of CANDIDATES) {
        try {
            const meta = JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
            if (meta && typeof meta.version === "string") {
                return { name: meta.name ?? FALLBACK.name, version: meta.version };
            }
        }
        catch {
            /* try the next candidate */
        }
    }
    return FALLBACK;
}
