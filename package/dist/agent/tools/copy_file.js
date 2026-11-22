import { constants, createReadStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { atomicFile } from "../../lib/atomic-file.js";
import { sandboxPath, sandboxWritePath } from "./paths.js";
import { booleanOption, invalid, preparePath, prepareWritePath, requiredString } from "./validate.js";
async function exists(path) {
    try {
        await stat(path);
        return true;
    }
    catch {
        return false;
    }
}
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
            return prepareWritePath(ctx.cwd, to);
        }
        catch (err) {
            return invalid(err.message);
        }
    },
    async execute(call, ctx) {
        const from = sandboxPath(ctx.cwd, requiredString(call, "from"));
        const to = sandboxWritePath(ctx.cwd, requiredString(call, "to"));
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
        const info = await stat(from);
        if (!info.isFile()) {
            return {
                ok: false,
                output: `copy source is not a file: ${from}`,
                code: "EISDIR",
            };
        }
        await mkdir(dirname(to), { recursive: true });
        if (overwrite) {
            const staged = atomicFile.temp(to, { mode: info.mode & 0o777 });
            try {
                await staged.fill(createReadStream(from));
                const committed = await staged.commit();
                return {
                    ok: true,
                    output: `copied ${from} to ${to}`,
                    sideEffects: { touched: [to] },
                    ...(committed.atomic === false ? { atomic: false, hint: "atomic rename unavailable; fallback copy used" } : {}),
                };
            }
            catch (err) {
                await staged.discard();
                throw err;
            }
        }
        else {
            const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
            const handle = await open(to, flags, info.mode & 0o777);
            try {
                await pipeline(createReadStream(from), handle.createWriteStream());
            }
            catch (err) {
                await handle.close().catch(() => undefined);
                throw err;
            }
        }
        return {
            ok: true,
            output: `copied ${from} to ${to}`,
            sideEffects: existed ? { touched: [to] } : { created: [to] },
        };
    },
};
