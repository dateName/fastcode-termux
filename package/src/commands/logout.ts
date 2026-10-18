import { getProvider } from "../providers/index.js";
import { listCredentials, maskKey, removeCredential, removeCredentialsForProvider } from "../config/store.js";
export const logoutCommand = {
    name: "logout",
    description: "Remove a stored API key. Usage: /logout <provider> [model] | /logout <provider> --all",
    run({ args }) {
        if (args.length === 0) {
            const credentials = listCredentials();
            if (credentials.length === 0)
                return { message: "No stored keys. Use /login to add one." };
            const lines = ["Stored keys (provider-wide):"];
            for (const c of credentials)
                lines.push(`  ${c.provider}   ${maskKey(c.key)}`);
            lines.push("");
            lines.push("Remove: /logout <provider>");
            lines.push("        /logout <provider> --all");
            return { message: lines.join("\n") };
        }
        const id = args[0];
        const provider = getProvider(id);
        if (!provider)
            return { message: `Unknown provider "${id}".` };
        if (args.includes("--all")) {
            const removed = removeCredentialsForProvider(provider.id);
            return {
                message: removed > 0
                    ? `Removed ${removed} stored key(s) for ${provider.label}.`
                    : `No stored key for ${provider.label}.`,
            };
        }
        if (args.length >= 2) {
            const ok = removeCredential(provider.id);
            return {
                message: ok
                    ? `Removed the stored key for ${provider.id} (applies to all its models).`
                    : `No stored key for ${provider.id}.`,
            };
        }
        const forProvider = listCredentials().filter((c) => c.provider === provider.id);
        if (forProvider.length === 0)
            return { message: `No stored key for ${provider.label}.` };
        removeCredential(provider.id);
        return { message: `Removed the stored key for ${provider.label} (all models).` };
    },
};
