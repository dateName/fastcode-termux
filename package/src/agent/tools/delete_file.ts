import { rm } from "node:fs/promises";
import { resolvePath } from "./paths.js";
import type { Tool } from "./types.js";
import { invalid, preparePath, requiredString } from "./validate.js";

export const deleteFileTool: Tool = {
    name: "delete_file",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
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
        const file = resolvePath(ctx.cwd, call);
        await rm(file, { recursive: true, force: true });
        return { ok: true, output: `deleted ${file}`, sideEffects: { removed: [file] } };
    },
};
