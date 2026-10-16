import { getProvider, PROVIDERS } from "../providers/index.js";
import { maskKey, setCredential } from "../config/store.js";
import { getPaths } from "../config/paths.js";
/**
 * Save a key scoped to one provider + model and describe it for the terminal.
 * Shared by the `/login` command and the guided flow in the app.
 */
export function saveScopedKey(providerId, providerLabel, model, key) {
    const trimmed = key.trim();
    setCredential(providerId, model, trimmed);
    const paths = getPaths();
    return [
        "Saved API key",
        `  provider  ${providerLabel} (${providerId})`,
        `  model     ${model}`,
        `  key       ${maskKey(trimmed)}`,
        `  stored    ${paths.auth} (mode 0600)`,
        "",
        `Remove with /logout ${providerId} ${model}`,
    ].join("\n");
}
export const loginCommand = {
    name: "login",
    description: "Bind an API key to a provider + model. Usage: /login [provider] [model] [key]",
    run({ args, state, actions }) {
        if (args.length === 0) {
            actions.startLogin({});
            return { message: introText(state) };
        }
        const provider = getProvider(args[0]);
        if (!provider) {
            return { message: `Unknown provider "${args[0]}". Available: ${PROVIDERS.map((p) => p.id).join(", ")}` };
        }
        if (provider.authEnv.length === 0) {
            return { message: `${provider.label} doesn't require an API key. Nothing to save.` };
        }
        if (args.length === 1) {
            actions.startLogin({ provider: provider.id });
            return { message: `Provider: ${provider.label} (${provider.id}).\nNow pick the model this key is for.` };
        }
        const model = args[1];
        if (args.length === 2) {
            actions.startLogin({ provider: provider.id, model });
            return { message: `Provider: ${provider.id} · model: ${model}.\nNow paste the API key (input is masked).` };
        }
        const key = args.slice(2).join(" ");
        return { message: saveScopedKey(provider.id, provider.label, model, key) };
    },
};
function introText(state) {
    const env = getProvider(state.providerId)?.authEnv?.[0] ?? "PROVIDER_API_KEY";
    return [
        "Bind an API key to a specific provider + model.",
        "",
        `  current scope: ${state.providerId} · ${state.model}`,
        "",
        "FastCode will ask for the provider, then the model, then the key.",
        "  one-liner:  /login <provider> <model> <key>",
        `  or set:     export ${env}=<key>   (provider-wide, any model)`,
    ].join("\n");
}
