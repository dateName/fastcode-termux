import { getProvider } from "../providers/index.js";
export const providerCommand = {
    name: "provider",
    description: "List or switch the active LLM provider. Usage: /provider [id]",
    run({ args, actions }) {
        if (args.length === 0) {
            actions.startLogin({ flow: "provider" });
            return { message: "Configure a provider: choose a provider and model, then enter its API key." };
        }
        const target = args[0];
        const next = getProvider(target);
        if (!next) {
            return { message: `Unknown provider "${target}". Try /provider with no args.` };
        }
        actions.setProvider(next.id);
        actions.setModel(next.defaultModel);
        return {
            message: `Provider set to ${next.label}. Default model: ${next.defaultModel}. Use /model to change.`,
        };
    },
};
