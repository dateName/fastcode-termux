import { PROVIDERS, getProvider } from "../providers/index.js";
import { listCredentials, listLegacy, maskKey, resolveApiKey } from "../config/store.js";
export const whoamiCommand = {
    name: "whoami",
    description: "Show which provider/model keys are configured.",
    run({ state }) {
        const lines = ["Authentication status:", `  current scope: ${state.providerId} · ${state.model}`];
        const current = getProvider(state.providerId);
        if (current)
            lines.push("  " + describeLookup(current, resolveApiKey(current.id, state.model, current.authEnv)));
        const credentials = listCredentials();
        lines.push("");
        lines.push(`Stored keys (${credentials.length}):`);
        if (credentials.length === 0)
            lines.push("  (none) — add one with /login");
        for (const c of credentials) {
            const marker = c.provider === state.providerId && c.model === state.model ? "● " : "  ";
            lines.push(`${marker}${c.provider}::${c.model}   ${maskKey(c.key)}`);
        }
        const legacy = listLegacy();
        if (legacy.length > 0) {
            lines.push("");
            lines.push("Unbound legacy keys (NOT used — re-bind them to a model):");
            for (const l of legacy)
                lines.push(`  ${l.provider}   ${maskKey(l.key)}   → /login ${l.provider} <model> <key>`);
        }
        const envLines = [];
        for (const p of PROVIDERS) {
            const envVar = p.authEnv.find((v) => process.env[v]);
            if (envVar)
                envLines.push(`  ${envVar}   (${p.id}, any model)`);
        }
        if (envLines.length > 0) {
            lines.push("");
            lines.push("Environment keys:");
            lines.push(...envLines);
        }
        return { message: lines.join("\n") };
    },
};
function describeLookup(provider, lookup) {
    if (provider.authEnv.length === 0)
        return `${provider.id}: no key needed`;
    if (lookup.status === "ok")
        return lookup.source === "env"
            ? `${provider.id}: env ${lookup.envVar}`
            : `${provider.id}: stored ${maskKey(lookup.key)}`;
    if (lookup.status === "unbound")
        return `${provider.id}: NO bound key (a stored legacy key needs re-binding)`;
    return `${provider.id}: no key — /login ${provider.id} <model> <key>`;
}
