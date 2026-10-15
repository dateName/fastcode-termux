import { getProvider } from "../providers/index.js";
import { loadAuth, saveAuth } from "../config/store.js";
export const logoutCommand = {
    name: "logout",
    description: "Remove a stored API key. Usage: /logout <provider>",
    run({ args }) {
        if (args.length === 0) {
            return { message: "Usage: /logout <provider>" };
        }
        const id = args[0];
        const provider = getProvider(id);
        if (!provider)
            return { message: `Unknown provider "${id}".` };
        const auth = loadAuth();
        if (!auth.keys[provider.id]) {
            return { message: `No stored key for ${provider.label}.` };
        }
        delete auth.keys[provider.id];
        saveAuth(auth);
        return { message: `Removed stored key for ${provider.label}.` };
    },
};
