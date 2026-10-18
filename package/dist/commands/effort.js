import { getProvider } from "../providers/index.js";
const EFFORTS = ["auto", "low", "medium", "high", "max"];
const HINTS = {
    auto: "provider default (send nothing)",
    low: "fast, minimal thinking",
    medium: "balanced",
    high: "deeper reasoning, slower",
    max: "maximum budget where supported",
};
export const effortCommand = {
    name: "effort",
    description: "Set thinking effort (auto/low/medium/high/max). Usage: /effort [level]",
    run({ args, state, actions }) {
        const provider = getProvider(state.providerId);
        const supported = provider?.supportsReasoning?.(state.model) ?? false;
        const current = (state.reasoningEffort ?? "auto");
        const apply = (value) => {
            actions.setReasoningEffort(value);
            return describe(value, provider, supported);
        };
        if (args.length > 0) {
            const value = args[0].toLowerCase();
            if (!EFFORTS.includes(value)) {
                return { message: `Unknown effort "${args[0]}". Choose: ${EFFORTS.join(", ")}.` };
            }
            return { message: apply(value) };
        }
        return {
            message: `Thinking effort: ${current}${supported ? "" : " (this provider has no thinking parameter)"}`,
            picker: {
                title: `Thinking effort · ${provider?.label ?? state.providerId}`,
                current,
                items: EFFORTS.map((value) => ({ value, label: value, hint: HINTS[value] })),
                onSelect: (value) => actions.pushSystemMessage(apply(value)),
            },
        };
    },
};
function describe(value, provider, supported) {
    if (value === "auto") {
        return "Thinking effort: auto — the provider's default is used (no thinking parameter is sent).";
    }
    if (!supported) {
        return `Thinking effort saved as ${value}, but ${provider?.label ?? "this provider"} does not expose a thinking parameter; ` +
            "requests will omit it. Switch to a reasoning-capable model/provider to use it.";
    }
    return `Thinking effort: ${value}. The next request will carry the provider-specific thinking parameter.`;
}
