import { readTextFile } from "./readers.js";
import { resolvePath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
export const readFileTool = {
    name: "read_file",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
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
        return { ok: true, output: await readTextFile(resolvePath(ctx.cwd, call)) };
    },
};
