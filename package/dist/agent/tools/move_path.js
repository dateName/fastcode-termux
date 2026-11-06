import { cp, mkdir, rename, rm } from "node:fs/promises";
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
export async function moveWithFallback(from, to, ops = { rename, cp, rm }) {
    try {
        await ops.rename(from, to);
        return "rename";
    }
    catch (err) {
        if (err?.code !== "EXDEV")
            throw err;
        await ops.cp(from, to, { recursive: true, force: false, errorOnExist: true });
        try {
            await ops.rm(from, { recursive: true, force: false });
        }
        catch (cleanup) {
            throw Object.assign(new Error(`copied ${from} to ${to}, but could not remove the source: ${cleanup?.message ?? String(cleanup)}`), {
                code: "UNKNOWN",
            });
        }
        return "copy";
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
                return invalid(`move target exists: ${to}`, "EEXIST", "Choose a target that does not exist.");
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
            return { ok: false, output: `move target exists: ${to}`, code: "EEXIST", hint: "Choose a target that does not exist." };
        await mkdir(dirname(to), { recursive: true });
        const method = await moveWithFallback(from, to);
        return {
            ok: true,
            output: method === "copy"
                ? `moved ${from} to ${to} (cross-device copy + remove)`
                : `moved ${from} to ${to}`,
            sideEffects: { removed: [from], touched: [to] },
        };
    },
};
