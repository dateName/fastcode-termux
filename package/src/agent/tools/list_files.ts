import { listFiles } from "./readers.js";
import { resolvePath } from "./paths.js";
import type { Tool } from "./types.js";
import { numberOption, preparePath } from "./validate.js";

export const listFilesTool: Tool = {
    name: "list_files",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        return preparePath(ctx.cwd, typeof call.path === "string" ? call.path : ".");
    },
    async execute(call, ctx) {
        return {
            ok: true,
            output: await listFiles(ctx.cwd, resolvePath(ctx.cwd, call, "."), numberOption(call.maxDepth, 2), call.detail === true),
        };
    },
};
