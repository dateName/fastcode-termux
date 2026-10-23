import { readMany } from "./readers.js";
import type { Tool } from "./types.js";
import { invalid, preparePath, stringArray } from "./validate.js";

export const readManyTool: Tool = {
    name: "read_many",
    stateScope: "call",
    revalidate: ["sandboxRoots"],
    prepare(call, ctx) {
        let paths: string[];
        try {
            paths = stringArray(call, "paths");
        }
        catch (err: any) {
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
