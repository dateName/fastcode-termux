import { grepFiles } from "./readers.js";
import { resolvePath } from "./paths.js";
import type { Tool } from "./types.js";
import { invalid, numberOption, preparePath, requiredString } from "./validate.js";

export const grepTool: Tool = {
    name: "grep",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        try {
            requiredString(call, "pattern");
        }
        catch (err: any) {
            return invalid(err.message);
        }
        return preparePath(ctx.cwd, typeof call.path === "string" ? call.path : ".");
    },
    async execute(call, ctx) {
        return {
            ok: true,
            output: await grepFiles(ctx.cwd, resolvePath(ctx.cwd, call, "."), requiredString(call, "pattern"), numberOption(call.maxDepth, 4)),
        };
    },
};
