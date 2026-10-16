import { resolveApiKey } from "../config/store.js";
import { getProviderOrThrow } from "../providers/index.js";
export function createStartupTranscript(config) {
    const messages = [
        `Welcome to FastCode. Provider: **${config.providerId}** · model: **${config.model}**.\n\nType **/help** to list slash commands, or just start chatting.`,
    ];
    const provider = getProviderOrThrow(config.providerId);
    if (provider.authEnv.length > 0) {
        const lookup = resolveApiKey(provider.id, config.model, provider.authEnv);
        if (lookup.status === "unbound") {
            messages.push(`Stored ${provider.label} key isn't bound to a model, so it won't be used. ` +
                `Re-bind it with \`/login ${provider.id} ${config.model} <key>\` (or \`/logout ${provider.id}\` to discard it).`);
        }
        else if (lookup.status === "missing") {
            messages.push(`No API key for ${provider.label} · ${config.model}. ` +
                `Run \`/login ${provider.id} ${config.model} <key>\`, or set ${provider.authEnv[0]} (provider-wide, any model).`);
        }
    }
    return messages.map((content, index) => ({
        id: index + 1,
        role: "system",
        content,
        markdown: true,
    }));
}
