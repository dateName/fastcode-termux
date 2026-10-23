import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePath } from "./paths.js";
import { invalid, preparePath, requiredString } from "./validate.js";
export const writeFileTool = {
    name: "write_file",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    prepare(call, ctx) {
        try {
            requiredString(call, "path");
            requiredString(call, "content");
        }
        catch (err) {
            return invalid(err.message);
        }
        return preparePath(ctx.cwd, requiredString(call, "path"));
    },
    async execute(call, ctx) {
        const file = resolvePath(ctx.cwd, call);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, requiredString(call, "content"), "utf8");
        return { ok: true, output: `wrote ${file}`, sideEffects: { touched: [file] } };
    },
};
