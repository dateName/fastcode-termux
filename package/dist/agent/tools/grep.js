import { grepFiles } from "./readers.js";
import { resolvePath } from "./paths.js";
import { booleanOption, clampInt, invalid, optionalNumber, preparePath, requiredString } from "./validate.js";
const MAX_PATTERN_LENGTH = 1000;
export const grepTool = {
    name: "grep",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        let pattern;
        try {
            pattern = requiredString(call, "pattern");
            if (pattern.length > MAX_PATTERN_LENGTH)
                return invalid(`pattern is too long (max ${MAX_PATTERN_LENGTH} characters)`);
            const flags = booleanOption(call.caseSensitive) ? "" : "i";
            new RegExp(pattern, flags);
            const context = optionalNumber(call, "context");
            const maxResults = optionalNumber(call, "maxResults");
            const maxDepth = optionalNumber(call, "maxDepth");
            if (context !== undefined && (context < 0 || context > 10))
                return invalid("context must be between 0 and 10");
            if (maxResults !== undefined && (maxResults < 1 || maxResults > 5000))
                return invalid("maxResults must be between 1 and 5000");
            if (maxDepth !== undefined && (maxDepth < 1 || maxDepth > 20))
                return invalid("maxDepth must be between 1 and 20");
            if (call.glob !== undefined && typeof call.glob !== "string")
                return invalid("glob must be a string");
        }
        catch (err) {
            return invalid(`invalid regular expression: ${err?.message ?? String(err)}`, "INVALID_ARGS", "pattern must be a valid regular expression");
        }
        return preparePath(ctx.cwd, typeof call.path === "string" ? call.path : ".");
    },
    async execute(call, ctx) {
        const pattern = requiredString(call, "pattern");
        const result = await grepFiles(ctx.cwd, resolvePath(ctx.cwd, call, "."), {
            pattern,
            flags: booleanOption(call.caseSensitive) ? "" : "i",
            glob: typeof call.glob === "string" ? call.glob : undefined,
            context: clampInt(optionalNumber(call, "context"), 0, 0, 10),
            maxResults: clampInt(optionalNumber(call, "maxResults"), 200, 1, 5000),
            maxDepth: clampInt(optionalNumber(call, "maxDepth"), 4, 1, 20),
            signal: ctx.signal,
        });
        return {
            ok: true,
            output: result.text,
            truncated: result.truncated,
            returnedLines: result.matchCount,
            matches: result.matchCount,
            hint: result.truncated ? "grep results were truncated by maxResults or the output cap." : undefined,
        };
    },
};
