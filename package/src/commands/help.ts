import { COMMANDS } from "./index.js";
export const helpCommand = {
    name: "help",
    description: "Show all available slash commands.",
    aliases: ["h", "?"],
    run() {
        const visible = COMMANDS.filter((c) => !c.hidden);
        const widest = Math.max(...visible.map((c) => c.name.length));
        const lines = [
            "Slash commands — type any of these at the prompt:",
            "",
            ...visible.map((c) => `  /${c.name.padEnd(widest)}   ${c.description}`),
            "",
            "Press ESC to cancel a streaming response. Press Ctrl+C twice to quit.",
        ];
        return { message: lines.join("\n") };
    },
};
