import { mkdir } from "node:fs/promises";
import { resolvePath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
export const makeDirTool = {
    name: "make_dir",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    prepare(call, ctx) {
        let path;
        try {
            path = requiredString(call, "path");
        }
        catch (err) {
            return invalid(err.message);
        }
        return preparePath(ctx.cwd, path);
    },
    async execute(call, ctx) {
        const dir = resolvePath(ctx.cwd, call);
        await mkdir(dir, { recursive: true });
        return { ok: true, output: `created ${dir}`, sideEffects: { created: [dir] } };
    },
};
