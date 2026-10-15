export const exitCommand = {
    name: "exit",
    description: "Quit FastCode.",
    aliases: ["quit", "q"],
    run() {
        return { message: "Bye!", quit: true };
    },
};
