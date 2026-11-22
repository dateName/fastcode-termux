import { constants, existsSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { buildStructuredDiff, structuredDiffFields } from "../../lib/values.js";
import { assertNotSymlink, sandboxWritePath } from "./paths.js";
import { readTextFileResult } from "./readers.js";
import { invalid, prepareWritePath, requiredString } from "./validate.js";
const APPEND_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0);
export const appendFileTool = {
    name: "append_file",
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
                beforeTruncated = true;
            }
        }
        const diff = buildStructuredDiff(beforeText, beforeText + content);
        diff.truncated = diff.truncated || beforeTruncated;
        await mkdir(dirname(file), { recursive: true });
        assertNotSymlink(file);
        const handle = await open(file, APPEND_FLAGS, 0o666);
        try {
            const info = await handle.stat();
            if (info.nlink > 1)
                throw new Error("refusing to append to a hard-linked file: " + file);
            await handle.writeFile(content, "utf8");
        }
        finally {
            await handle.close();
        }
        return {
            ok: true,
            output: `appended ${file}`,
            sideEffects: existed ? { touched: [file] } : { created: [file] },
            ...structuredDiffFields(diff),
        };
    },
};
