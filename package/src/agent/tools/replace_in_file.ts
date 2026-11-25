import { readFile } from "node:fs/promises";
import { atomicFile } from "../../lib/atomic-file.js";
import { buildStructuredDiff, structuredDiffFields } from "../../lib/values.js";
import { countChangedLines, unifiedDiff } from "../../lib/diff.js";
import { approveLargeEdit } from "./edit-approval.js";
import { existingMode, sandboxWritePath } from "./paths.js";
import type { Tool } from "./types.js";
import { invalid, optionalNumber, prepareWritePath, requiredString } from "./validate.js";

function countOccurrences(source: string, find: string): number {
    if (!find)
        return 0;
    return source.split(find).length - 1;
}

export const replaceInFileTool: Tool = {
    name: "replace_in_file",
    requiresTrust: true,
    approvalHints: { mayRequireApproval: true },
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    prepare(call, ctx) {
        try {
            requiredString(call, "path");
            const find = requiredString(call, "find");
            requiredString(call, "replace");
            if (!find)
                return invalid("find must not be empty");
            const expected = optionalNumber(call, "expectedMatches");
            if (expected !== undefined && (expected < 1 || !Number.isInteger(expected)))
                return invalid("expectedMatches must be a positive integer");
        }
        catch (err: any) {
            return invalid(err.message);
        }
        return prepareWritePath(ctx.cwd, requiredString(call, "path"));
    },
    async execute(call, ctx) {
        const file = sandboxWritePath(ctx.cwd, requiredString(call, "path"));
        const find = requiredString(call, "find");
        const replacement = requiredString(call, "replace");
        const expected = optionalNumber(call, "expectedMatches");
        const source = await readFile(file, "utf8");
        const count = countOccurrences(source, find);
        if (count === 0) {
            return {
                ok: false,
                output: `text not found in ${file}`,
                code: "NOT_FOUND",
                hint: "Read the file first and pass the exact current text.",
                matches: 0,
            };
        }
        if (expected !== undefined && count !== expected) {
            return {
                ok: false,
                output: `expected ${expected} match(es) but found ${count} in ${file}; file unchanged`,
                code: "INVALID_ARGS",
                hint: "Update find or expectedMatches so the replacement is explicit.",
                matches: count,
            };
        }
        const next = source.split(find).join(replacement);
        const diff = buildStructuredDiff(source, next);
        const unified = unifiedDiff(file, file, source, next, "update");
        const approvalDenied = await approveLargeEdit("replace_in_file", call, ctx, file, unified, countChangedLines(source, next));
        if (approvalDenied)
            return approvalDenied;
        const mode = await existingMode(file);
        const written = await atomicFile.write(file, next, { mode: mode ?? 0o666 });
        return {
            ok: true,
            output: `replaced ${count} occurrence(s) in ${file}`,
            ...(written.atomic === false ? { atomic: false, hint: "atomic rename unavailable; fallback copy used" } : {}),
            matches: count,
            sideEffects: { touched: [file] },
            ...structuredDiffFields(diff),
            diffs: [{ path: file, unified, ...diff }],
        };
    },
};
