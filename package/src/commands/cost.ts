export const costCommand = {
    name: "cost",
    description: "Show approximate cost & token usage for this session.",
    run({ state }) {
        const lines = [
            `Provider: ${state.providerId}`,
            `Model:    ${state.model}`,
            `Tokens:   ${state.totalInputTokens} in / ${state.totalOutputTokens} out`,
            `Cost:     ~$${state.totalCostUsd.toFixed(4)}`,
        ];
        return { message: lines.join("\n") };
    },
};
