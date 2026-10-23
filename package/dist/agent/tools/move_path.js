import { mkdir, rename } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { dirname } from "node:path";
import { sandboxPath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
function exists(path) {
    try {
        lstatSync(path);
        return true;
    }
    catch {
        return false;
    }
}
export const movePathTool = {
    name: "move_path",
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
            const checkedTo = preparePath(ctx.cwd, to);
            if (!checkedTo.ok)
                return checkedTo;
            if (exists(to))
                return invalid(`move target exists: ${to}`);
            return { ok: true };
        }
        catch (err) {
            return invalid(err.message);
        }
    },
    async execute(call, ctx) {
        const from = sandboxPath(ctx.cwd, requiredString(call, "from"));
        const to = sandboxPath(ctx.cwd, requiredString(call, "to"));
        if (exists(to))
            return { ok: false, output: `move target exists: ${to}` };
        await mkdir(dirname(to), { recursive: true });
        await rename(from, to);
        return { ok: true, output: `moved ${from} to ${to}`, sideEffects: { removed: [from], touched: [to] } };
    },
};
