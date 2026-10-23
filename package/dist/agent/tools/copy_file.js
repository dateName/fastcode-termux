import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { sandboxPath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
export const copyFileTool = {
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
        catch (err) {
            return invalid(err.message);
        }
    },
    async execute(call, ctx) {
        const from = sandboxPath(ctx.cwd, requiredString(call, "from"));
        const to = sandboxPath(ctx.cwd, requiredString(call, "to"));
        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, to);
        return { ok: true, output: `copied ${from} to ${to}`, sideEffects: { touched: [to] } };
    },
};
