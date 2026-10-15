import { PROVIDERS, getProvider } from "../providers/index.js";
export const providerCommand = {
    name: "provider",
    description: "List or switch the active LLM provider. Usage: /provider [id]",
    run({ args, actions, state }) {
        if (args.length === 0) {
            const lines = ["Available providers:"];
            for (const p of PROVIDERS) {
                const marker = p.id === state.providerId ? "● " : "  ";
                const auth = p.authEnv.length === 0 ? "(no key needed)" : `[${p.authEnv.join(", ")}]`;
                lines.push(`${marker}${p.id.padEnd(12)} ${p.label}  ${auth}`);
            }
            lines.push("");
            lines.push("Switch with `/provider <id>` (e.g. `/provider openrouter`).");
            return { message: lines.join("\n") };
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
