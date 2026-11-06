import { readFileRange, readTextFileResult } from "./readers.js";
import { resolvePath } from "./paths.js";
import type { Tool } from "./types.js";
import { clampInt, invalid, optionalNumber, preparePath, requiredString } from "./validate.js";

const MAX_READ_LINES = 2000;

export const readFileTool: Tool = {
    name: "read_file",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        let path: string;
        try {
            path = requiredString(call, "path");
            const offset = optionalNumber(call, "offset");
            const limit = optionalNumber(call, "limit");
            if (offset !== undefined && offset < 1)
                return invalid("offset must be >= 1");
            if (limit !== undefined && limit < 1)
                return invalid("limit must be >= 1");
        }
        catch (err: any) {
            return invalid(err.message);
        }
        return preparePath(ctx.cwd, path);
    },
    async execute(call, ctx) {
        const file = resolvePath(ctx.cwd, call);
        const offset = optionalNumber(call, "offset");
        const limit = optionalNumber(call, "limit");
        if (offset === undefined && limit === undefined) {
            const result = await readTextFileResult(file);
            const output = result.truncated
                ? `${result.text}\n[... truncated at ${result.returnedBytes} of ${result.totalBytes} bytes; use offset/limit, grep, or a narrower file ...]`
                : result.text;
            return {
                ok: true,
                output,
                truncated: result.truncated,
                totalLines: result.totalLines,
                returnedLines: result.returnedLines,
                totalBytes: result.totalBytes,
                returnedBytes: result.returnedBytes,
            };
        }
        const start = clampInt(offset, 1, 1, 1_000_000);
        const count = clampInt(limit, MAX_READ_LINES, 1, MAX_READ_LINES);
        const result = await readFileRange(file, start, count, { signal: ctx.signal });
        if (result.binary) {
            return {
                ok: true,
                output: result.text,
                truncated: false,
                totalLines: 0,
                returnedLines: 0,
                totalBytes: result.totalBytes,
                returnedBytes: 0,
            };
        }
        if (result.returnedLines === 0 && start > result.totalLines) {
            return {
                ok: false,
                output: `offset ${start} is beyond the end of ${file} (${result.totalLines} lines)`,
                code: "NOT_FOUND",
                hint: "Use a smaller offset or read without offset.",
                totalLines: result.totalLines,
                returnedLines: 0,
            };
        }
        const end = start + result.returnedLines - 1;
        const header = `[lines ${start}-${end} of ${result.totalLines}${result.scannedAll ? "" : "+"}]\n`;
        return {
            ok: true,
            output: header + result.text,
            truncated: result.truncated,
            hint: result.scannedAll ? undefined : "totalLines is a lower bound; the file scan hit FASTCODE_READ_SCAN_MAX_BYTES.",
            totalLines: result.totalLines,
            returnedLines: result.returnedLines,
            totalBytes: result.totalBytes,
            returnedBytes: result.returnedBytes,
        };
    },
};
