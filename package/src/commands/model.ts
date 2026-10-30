import { getProviderOrThrow } from "../providers/index.js";
export function isValidModelId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/.test(value);
}
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
        actions.startLogin({ flow: "model", provider: provider.id, model: state.model });
        return { message: `Configure ${provider.label}: choose a model, then enter its API key.` };
    },
};
