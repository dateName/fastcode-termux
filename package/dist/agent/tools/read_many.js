import { readMany } from "./readers.js";
import { invalid, preparePath, stringArray } from "./validate.js";
export const readManyTool = {
    name: "read_many",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        let paths;
        try {
            paths = stringArray(call, "paths");
        }
        catch (err) {
            return invalid(err.message);
        }
        for (const path of paths) {
            const checked = preparePath(ctx.cwd, path);
            if (!checked.ok)
                return checked;
        }
        return { ok: true };
    },
    async execute(call, ctx) {
        return { ok: true, output: await readMany(ctx.cwd, stringArray(call, "paths")) };
    },
};
