import { resolveApiKey } from "../config/store.js";
import { getProviderOrThrow } from "../providers/index.js";
export function createStartupTranscript(config) {
    const messages = [
        `Welcome to FastCode. Provider: **${config.providerId}** · model: **${config.model}**.\n\nType **/help** to list slash commands, or just start chatting.`,
    ];
    const provider = getProviderOrThrow(config.providerId);
    if (provider.authEnv.length > 0) {
        const key = resolveApiKey(provider.id, provider.authEnv);
        if (!key) {
            messages.push(`No API key found for ${provider.label}. Run \`/login ${provider.id} <key>\` or set ${provider.authEnv[0]}.`);
        }
    }
    return messages.map((content, index) => ({
        id: index + 1,
        role: "system",
        content,
        markdown: true,
    }));
}
