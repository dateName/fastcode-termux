import { getProvider, PROVIDERS } from "../providers/index.js";
import { maskKey, setCredential } from "../config/store.js";
import { getPaths } from "../config/paths.js";
/**
 * Save a provider-wide key and describe it for the terminal. `model` is kept
 * for the `/login provider model key` one-liner and only recorded as the
 * credential's origin — the key itself is reused by every model of that
 * provider. Shared by the `/login` command and the guided flow in the app.
 */
export function saveScopedKey(providerId, providerLabel, model, key) {
    const trimmed = key.trim();
    setCredential(providerId, model, trimmed);
    const paths = getPaths();
    return [
        "Saved API key",
        `  provider  ${providerLabel} (${providerId})`,
        `  scope     all ${providerId} models (saved from ${model || "unknown"})`,
        `  key       ${maskKey(trimmed)}`,
        `  stored    ${paths.auth} (mode 0600)`,
        "",
        `Remove with /logout ${providerId}`,
    ].join("\n");
}
export const loginCommand = {
    name: "login",
    description: "Bind a provider-wide API key. Usage: /login [provider] [model] [key]",
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
            return { message: `Provider: ${provider.label} (${provider.id}).\nThe key will apply to every model of this provider.` };
        }
        const model = args[1];
        if (args.length === 2) {
            actions.startLogin({ provider: provider.id, model });
            return { message: `Provider: ${provider.id} · saved from model: ${model}.\nNow paste the API key (input is masked).` };
        }
        const key = args.slice(2).join(" ");
        return { message: saveScopedKey(provider.id, provider.label, model, key) };
    },
};
function introText(state) {
    const env = getProvider(state.providerId)?.authEnv?.[0] ?? "PROVIDER_API_KEY";
    return [
        "Bind a provider-wide API key (reused by every model of that provider).",
        "",
        `  current provider: ${state.providerId}`,
        "",
        "FastCode will ask for the provider, then optionally a model name, then the key.",
        "  one-liner:  /login <provider> <model> <key>",
        `  or set:     export ${env}=<key>   (provider-wide, any model)`,
    ].join("\n");
}
