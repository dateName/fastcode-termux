import { getProviderOrThrow } from "../providers/index.js";
import { resolveApiKey } from "../config/store.js";
export const modelCommand = {
    name: "model",
    description: "List models for the current provider, or switch model. Usage: /model [id]",
    async run({ args, state, actions }) {
        const provider = getProviderOrThrow(state.providerId);
        if (args.length === 0) {
            const apiKey = resolveApiKey(provider.id, provider.authEnv);
            const models = await provider.listModels(apiKey);
            if (models.length === 0) {
                return { message: `No models available from ${provider.label}.` };
            }
            const lines = [`Models for ${provider.label}:`];
            for (const m of models.slice(0, 50)) {
                const marker = m.id === state.model ? "● " : "  ";
                const label = m.label ? ` — ${m.label}` : "";
                lines.push(`${marker}${m.id}${label}`);
            }
            if (models.length > 50)
                lines.push(`  … and ${models.length - 50} more.`);
            lines.push("");
            lines.push("Switch with `/model <id>`.");
            return { message: lines.join("\n") };
        }
        const id = args.join(" ");
        actions.setModel(id);
        return { message: `Model set to ${id}.` };
    },
};
