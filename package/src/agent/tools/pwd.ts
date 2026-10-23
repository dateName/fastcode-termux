import type { Tool } from "./types.js";

export const pwdTool: Tool = {
    name: "pwd",
    stateScope: "call",
    prepare() {
        return { ok: true };
    },
    async execute(_call, ctx) {
        return { ok: true, output: ctx.cwd };
    },
};
