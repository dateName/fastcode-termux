import { PROVIDERS, getProvider } from "../providers/index.js";
export const providerCommand = {
    name: "provider",
    description: "List or switch the active LLM provider. Usage: /provider [id]",
    run({ args, actions, state }) {
        if (args.length === 0) {
            return {
                message: "Select a provider (↑/↓ or a number, Enter to confirm).",
                picker: {
                    title: "Select provider",
                    current: state.providerId,
                    items: PROVIDERS.map((p) => ({
                        value: p.id,
                        label: `${p.id.padEnd(12)} ${p.label}`,
                        hint: p.authEnv.length === 0 ? "(no key needed)" : `[${p.authEnv.join(", ")}]`,
                    })),
                    onSelect: (id) => {
                        const next = getProvider(id);
                        if (!next)
                            return;
                        actions.setProvider(next.id);
                        actions.setModel(next.defaultModel);
                        actions.pushSystemMessage(`Provider set to ${next.label}. Default model: ${next.defaultModel}.`);
                    },
                },
            };
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
