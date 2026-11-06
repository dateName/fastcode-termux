import { readManyResult } from "./readers.js";
import type { Tool } from "./types.js";
import { invalid, optionalNumber, preparePath, stringArray } from "./validate.js";

export const readManyTool: Tool = {
    name: "read_many",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        let paths: string[];
        try {
            paths = stringArray(call, "paths");
            if (paths.length === 0)
                return invalid("paths must contain at least one path");
            const maxBytes = optionalNumber(call, "maxBytes");
            if (maxBytes !== undefined && maxBytes < 1)
                return invalid("maxBytes must be >= 1");
        }
        catch (err: any) {
            return invalid(err.message);
        }
        for (const path of paths) {
            const checked = preparePath(ctx.cwd, path);
            if (!checked.ok)
                return checked;
        }
        return { ok: true };
    },
    async execute(call, ctx) {
        const paths = stringArray(call, "paths");
        const requested = optionalNumber(call, "maxBytes");
        const maxBytes = requested === undefined ? undefined : Math.max(1, Math.floor(requested));
        const result = await readManyResult(ctx.cwd, paths, maxBytes);
        return {
            ok: true,
            output: result.text,
            truncated: result.truncated,
            totalBytes: result.totalBytes,
            returnedBytes: result.returnedBytes,
            filesRead: result.filesRead,
            filesSkipped: result.filesSkipped,
            hint: result.filesSkipped > 0 ? `${result.filesSkipped} file(s) skipped by the read_many byte budget.` : undefined,
        };
    },
};
