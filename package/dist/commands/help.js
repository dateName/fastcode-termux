import { COMMANDS } from "./index.js";
import { t } from "../i18n/index.js";
export const helpCommand = {
    name: "help",
    description: "Show all available slash commands.",
    aliases: ["h", "?"],
    run() {
        const visible = COMMANDS.filter((c) => !c.hidden);
        const widest = Math.max(...visible.map((c) => c.name.length));
        const lines = [
            t("help.title"),
            "",
            ...visible.map((c) => `  /${c.name.padEnd(widest)}   ${c.description}`),
            "",
            t("help.footer"),
        ];
        return { message: lines.join("\n") };
    },
};
