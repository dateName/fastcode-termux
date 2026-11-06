import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { sandboxPath } from "./paths.js";
import type { Tool } from "./types.js";
import { booleanOption, invalid, preparePath, requiredString } from "./validate.js";

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    }
    catch {
        return false;
    }
}

export const copyFileTool: Tool = {
    name: "copy_file",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    prepare(call, ctx) {
        try {
            const from = requiredString(call, "from");
            const to = requiredString(call, "to");
            const checkedFrom = preparePath(ctx.cwd, from);
            if (!checkedFrom.ok)
                return checkedFrom;
            return preparePath(ctx.cwd, to);
        }
        catch (err: any) {
            return invalid(err.message);
        }
    },
    async execute(call, ctx) {
        const from = sandboxPath(ctx.cwd, requiredString(call, "from"));
        const to = sandboxPath(ctx.cwd, requiredString(call, "to"));
        const overwrite = booleanOption(call.overwrite);
        const existed = await exists(to);
        if (existed && !overwrite) {
            return {
                ok: false,
                output: `copy target exists: ${to}`,
                code: "EEXIST",
                hint: "Pass overwrite:true to replace the target explicitly.",
            };
        }
        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, to);
        return {
            ok: true,
            output: `copied ${from} to ${to}`,
            sideEffects: existed ? { touched: [to] } : { created: [to] },
        };
    },
};
