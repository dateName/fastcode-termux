import { getProvider, PROVIDERS } from "../providers/index.js";
import { loadAuth, saveAuth } from "../config/store.js";
export const loginCommand = {
    name: "login",
    description: "Store an API key for a provider. Usage: /login <provider> <key>",
    run({ args, state }) {
        if (args.length === 0) {
            return { message: helpText(state.providerId) };
        }
        const providerId = args[0];
        const provider = getProvider(providerId);
        if (!provider) {
            return { message: `Unknown provider "${providerId}". Available: ${PROVIDERS.map((p) => p.id).join(", ")}` };
        }
        if (provider.authEnv.length === 0) {
            return { message: `${provider.label} doesn't require an API key. Skipping.` };
        }
        if (args.length < 2) {
            return {
                message: [
                    `Set ${provider.label} key with one of:`,
                    ``,
                    `  /login ${provider.id} <api-key>`,
                    `  export ${provider.authEnv[0]}=<api-key>`,
                    ``,
                    `Tip: setting the env var keeps the key off your /login history.`,
                ].join("\n"),
            };
        }
        const key = args.slice(1).join(" ").trim();
        const auth = loadAuth();
        auth.keys[provider.id] = key;
        saveAuth(auth);
        return {
            message: `Saved ${provider.label} key (~/.fastcode/auth.json, mode 0600). Use /logout ${provider.id} to remove.`,
        };
    },
};
function helpText(currentId) {
    const lines = [
        "Authentication:",
        "",
        ...PROVIDERS.map((p) => {
            const marker = p.id === currentId ? "● " : "  ";
            const env = p.authEnv.length === 0 ? "(no key)" : p.authEnv.join(" / ");
            return `${marker}${p.id.padEnd(12)} env: ${env}`;
        }),
        "",
        "Save a key:  /login <provider> <api-key>",
        "Remove:      /logout <provider>",
        "Or set the matching env var before launching FastCode.",
    ];
    return lines.join("\n");
}
