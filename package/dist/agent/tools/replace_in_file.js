import { readFile, writeFile } from "node:fs/promises";
import { resolvePath } from "./paths.js";
import { invalid, optionalNumber, preparePath, requiredString } from "./validate.js";
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
        return preparePath(ctx.cwd, requiredString(call, "path"));
    },
    async execute(call, ctx) {
        const file = resolvePath(ctx.cwd, call);
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
        await writeFile(file, source.split(find).join(replacement), "utf8");
        return {
            ok: true,
            output: `replaced ${count} occurrence(s) in ${file}`,
            matches: count,
            sideEffects: { touched: [file] },
        };
    },
};
