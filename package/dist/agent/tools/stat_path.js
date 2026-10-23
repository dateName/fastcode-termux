import { stat } from "node:fs/promises";
import { resolvePath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
export const statPathTool = {
    name: "stat_path",
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
        const file = resolvePath(ctx.cwd, call);
        const info = await stat(file);
        return {
            ok: true,
            output: JSON.stringify({
                path: file,
                type: info.isDirectory() ? "dir" : info.isFile() ? "file" : "other",
                size: info.size,
                modified: info.mtime.toISOString(),
            }, null, 2),
        };
    },
};
