import { readTextFile } from "./readers.js";
import { resolvePath } from "./paths.js";
import type { Tool } from "./types.js";
import { invalid, preparePath, requiredString } from "./validate.js";

export const readFileTool: Tool = {
    name: "read_file",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        let path: string;
        try {
            path = requiredString(call, "path");
        }
        catch (err: any) {
            return invalid(err.message);
        }
        return preparePath(ctx.cwd, path);
    },
    async execute(call, ctx) {
        return { ok: true, output: await readTextFile(resolvePath(ctx.cwd, call)) };
    },
};
