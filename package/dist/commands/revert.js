export const revertCommand = {
    name: "revert",
    description: "Revert to before user message N (message-only; /revert <n>)",
    aliases: ["undo"],
    run({ args }) {
        if (args.includes("--files"))
            return { message: "File restore is not implemented yet; /revert only rolls back conversation messages." };
        const raw = args.find((arg) => !arg.startsWith("-"));
        const n = Number(raw);
        if (!raw || !Number.isInteger(n) || n < 1)
            return { message: "Usage: /revert <n>  (n = user message number to remove and everything after it)" };
        return { revert: n };
    },
};
