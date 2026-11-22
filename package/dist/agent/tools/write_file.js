import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicFile } from "../../lib/atomic-file.js";
import { buildStructuredDiff, structuredDiffFields } from "../../lib/values.js";
import { assertNotSymlink, existingMode, sandboxWritePath } from "./paths.js";
import { readTextFileResult } from "./readers.js";
import { invalid, prepareWritePath, requiredString } from "./validate.js";
export const writeFileTool = {
    name: "write_file",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    prepare(call, ctx) {
        try {
            requiredString(call, "path");
            requiredString(call, "content");
        }
        catch (err) {
            return invalid(err.message);
        }
        return prepareWritePath(ctx.cwd, requiredString(call, "path"));
    },
    async execute(call, ctx) {
        const file = sandboxWritePath(ctx.cwd, requiredString(call, "path"));
        const content = requiredString(call, "content");
        const existed = existsSync(file);
        let beforeText = "";
        let beforeTruncated = false;
        if (existed) {
            try {
                const before = await readTextFileResult(file, 16_384);
                beforeText = before.binary ? "" : before.text;
                beforeTruncated = before.truncated || before.binary;
            }
            catch {
                // A binary/locked file still lets write_file replace it; the diff
                // just cannot show the old text.
                beforeTruncated = true;
            }
        }
        const diff = buildStructuredDiff(beforeText, content);
        diff.truncated = diff.truncated || beforeTruncated;
        const mode = existed ? await existingMode(file) : 0o666;
        await mkdir(dirname(file), { recursive: true });
        assertNotSymlink(file);
        const written = await atomicFile.write(file, content, { mode: mode ?? 0o666 });
        return {
            ok: true,
            output: `wrote ${file}`,
            sideEffects: existed ? { touched: [file] } : { created: [file] },
            ...(written.atomic === false ? { atomic: false, hint: "atomic rename unavailable; fallback copy used" } : {}),
            ...structuredDiffFields(diff),
        };
    },
};
