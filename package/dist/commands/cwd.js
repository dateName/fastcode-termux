export const cwdCommand = {
    name: "cwd",
    description: "Show the current agent sandbox root.",
    run() {
        return { message: `Agent sandbox root:\n\n\`${process.cwd()}\`` };
    },
};
