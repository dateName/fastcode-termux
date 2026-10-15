import { DEFAULT_CONFIG, saveConfig } from "../config/store.js";
export const resetCommand = {
    name: "reset",
    description: "Reset config to defaults (does not touch API keys).",
    run({ actions }) {
        saveConfig({ ...DEFAULT_CONFIG });
        actions.setProvider(DEFAULT_CONFIG.providerId);
        actions.setModel(DEFAULT_CONFIG.model);
        actions.setTheme(DEFAULT_CONFIG.theme);
        actions.setSystemPrompt(DEFAULT_CONFIG.systemPrompt);
        return { message: "Config reset to defaults." };
    },
};
