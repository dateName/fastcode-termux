import { THEMES } from "../config/themes.js";
export const themeCommand = {
    name: "theme",
    description: "List or switch the color theme. Usage: /theme [id]",
    run({ args, state, actions }) {
        if (args.length === 0) {
            const lines = ["Themes:"];
            for (const id of Object.keys(THEMES)) {
                const marker = id === state.theme ? "● " : "  ";
                lines.push(`${marker}${id}  — ${THEMES[id].label}`);
            }
            lines.push("");
            lines.push("Switch with `/theme <id>`.");
            return { message: lines.join("\n") };
        }
        const id = args[0];
        if (!THEMES[id])
            return { message: `Unknown theme "${id}".` };
        actions.setTheme(id);
        return { message: `Theme set to ${id}.` };
    },
};
