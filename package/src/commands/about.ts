import { platformLabel } from "../lib/platform.js";
export const aboutCommand = {
    name: "about",
    description: "Show version, platform, and links.",
    aliases: ["version"],
    run() {
        const lines = [
            `FastCode  — multi-LLM TUI coding assistant`,
            `Platform: ${platformLabel()}  •  Node ${process.version}`,
            ``,
            `GitHub:   https://github.com/SimpleLittleDev/FastCode`,
            `Skills:   https://skillshub.wtf`,
        ];
        return { message: lines.join("\n") };
    },
};
