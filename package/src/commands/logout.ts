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
            const lines = ["Stored keys (provider :: model):"];
            for (const c of credentials)
                lines.push(`  ${c.provider}::${c.model}   ${maskKey(c.key)}`);
            lines.push("");
            lines.push("Remove: /logout <provider> <model>");
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
            const model = args[1];
            const ok = removeCredential(provider.id, model);
            return {
                message: ok
                    ? `Removed stored key for ${provider.id}::${model}.`
                    : `No stored key for ${provider.id}::${model}.`,
            };
        }
        const forProvider = listCredentials().filter((c) => c.provider === provider.id);
        if (forProvider.length === 0)
            return { message: `No stored key for ${provider.label}.` };
        if (forProvider.length === 1) {
            removeCredential(forProvider[0].provider, forProvider[0].model);
            return { message: `Removed stored key for ${forProvider[0].provider}::${forProvider[0].model}.` };
        }
        const lines = [`${provider.label} has ${forProvider.length} stored keys — pick one to remove:`];
        for (const c of forProvider)
            lines.push(`  /logout ${c.provider} ${c.model}   (${maskKey(c.key)})`);
        lines.push(`  /logout ${provider.id} --all   (remove all)`);
        return { message: lines.join("\n") };
    },
};
