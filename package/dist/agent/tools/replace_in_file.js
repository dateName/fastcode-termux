import { readFile, writeFile } from "node:fs/promises";
import { resolvePath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
export const replaceInFileTool = {
    name: "replace_in_file",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    prepare(call, ctx) {
        try {
            requiredString(call, "path");
            requiredString(call, "find");
            requiredString(call, "replace");
        }
        catch (err) {
            return invalid(err.message);
        }
        return preparePath(ctx.cwd, requiredString(call, "path"));
    },
    async execute(call, ctx) {
        const file = resolvePath(ctx.cwd, call);
        const find = requiredString(call, "find");
        const replacement = requiredString(call, "replace");
        const source = await readFile(file, "utf8");
        if (!source.includes(find))
            return { ok: false, output: `text not found in ${file}` };
        await writeFile(file, source.split(find).join(replacement), "utf8");
        return { ok: true, output: `replaced text in ${file}`, sideEffects: { touched: [file] } };
    },
};
