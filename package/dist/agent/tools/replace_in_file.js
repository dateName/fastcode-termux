import { readFile } from "node:fs/promises";
import { atomicFile } from "../../lib/atomic-file.js";
import { buildStructuredDiff, structuredDiffFields } from "../../lib/values.js";
import { existingMode, sandboxWritePath } from "./paths.js";
import { invalid, optionalNumber, prepareWritePath, requiredString } from "./validate.js";
function countOccurrences(source, find) {
    if (!find)
        return 0;
    return source.split(find).length - 1;
}
export const replaceInFileTool = {
    name: "replace_in_file",
    requiresTrust: true,
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
        catch (err) {
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
        const mode = await existingMode(file);
        const written = await atomicFile.write(file, next, { mode: mode ?? 0o666 });
        return {
            ok: true,
            output: `replaced ${count} occurrence(s) in ${file}`,
            ...(written.atomic === false ? { atomic: false, hint: "atomic rename unavailable; fallback copy used" } : {}),
            matches: count,
            sideEffects: { touched: [file] },
            ...structuredDiffFields(diff),
        };
    },
};
