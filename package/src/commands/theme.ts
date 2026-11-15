import { THEMES } from "../config/themes.js";

export const themeCommand = {
    name: "theme",
    description: "Pick or switch the color theme. Usage: /theme [id]",
    run({ args, state, actions }) {
        if (args.length === 0) {
            const ids = Object.keys(THEMES);
            return {
                message: `Theme: ${state.theme}`,
                picker: {
                    title: "Color theme",
                    current: state.theme,
                    items: ids.map((id) => ({
                        value: id,
                        label: THEMES[id].label,
                        hint: id,
                    })),
                    onSelect: (value) => {
                        actions.setTheme(value);
                        actions.pushSystemMessage(`Theme set to ${value}.`);
                    },
                },
            };
        }
        const id = args[0];
        if (!THEMES[id])
            return { message: `Unknown theme "${id}".` };
        actions.setTheme(id);
        return { message: `Theme set to ${id}.` };
    },
};
