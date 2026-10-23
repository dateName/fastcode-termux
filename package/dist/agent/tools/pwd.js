export const pwdTool = {
    name: "pwd",
    stateScope: "call",
    prepare() {
        return { ok: true };
    },
    async execute(_call, ctx) {
        return { ok: true, output: ctx.cwd };
    },
};
