import { lstat, rm } from "node:fs/promises";
import { resolvePath } from "./paths.js";
import { booleanOption, invalid, preparePath, requiredString } from "./validate.js";
export const deleteFileTool = {
    name: "delete_file",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    approvalHints: { mayRequireApproval: true },
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
        const recursive = booleanOption(call.recursive);
        let info;
        try {
            info = await lstat(file);
        }
        catch (err) {
            if (err?.code === "ENOENT")
                return { ok: false, output: `path does not exist: ${file}`, code: "ENOENT", hint: "Check the path before deleting." };
            throw err;
        }
        if (info.isDirectory() && !recursive) {
            return {
                ok: false,
                output: `refusing to delete a directory without recursive:true: ${file}`,
                code: "EISDIR",
                hint: "Pass recursive:true to delete a directory tree.",
            };
        }
        await rm(file, { recursive, force: false });
        return { ok: true, output: `deleted ${file}`, sideEffects: { removed: [file] } };
    },
};
