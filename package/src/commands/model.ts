import { getProviderOrThrow, probeProvider } from "../providers/index.js";
import { resolveProviderKey } from "../config/store.js";
export const modelCommand = {
    name: "model",
    description: "Pick a model interactively, or switch with /model <id>",
    async run({ args, state, actions }) {
        const provider = getProviderOrThrow(state.providerId);
        if (args.length > 0) {
            const id = args.join(" ");
            actions.setModel(id);
            return { message: `Model set to ${id}.` };
        }
        const { key } = resolveProviderKey(provider.id, provider.authEnv);
        const fetched = await provider.listModels(key).catch(() => []);
        const models = dedupe(fetched);
        if (models.length === 0) {
            return { message: `No models available from ${provider.label}.` };
        }
        const online = await probeProvider(provider, key);
        const list = models.slice(0, 50);
        return {
            message: `Models for ${provider.label}: ${list.length}${online ? "" : " (offline — showing the built-in list)"}.\n` +
                "Use ↑/↓, a number, or Enter to select.",
            picker: {
                title: `Select model · ${provider.label}${online ? "" : " (offline)"}`,
                current: state.model,
                items: list.map((m) => ({
                    value: m.id,
                    label: m.id,
                    hint: m.label ? `— ${m.label}` : undefined,
                })),
                onSelect: (id) => {
                    actions.setModel(id);
                    actions.pushSystemMessage(`Model set to ${id}.`);
                },
            },
        };
    },
};
function dedupe(models) {
    const seen = new Set();
    const out = [];
    for (const model of models) {
        if (!model?.id || seen.has(model.id))
            continue;
        seen.add(model.id);
        out.push(model);
    }
    return out;
}
