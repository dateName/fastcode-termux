export const systemCommand = {
    name: "system",
    description: "Show or set the system prompt. Usage: /system [new prompt]",
    run({ raw, state, actions }) {
        // Strip the leading "/system" verb keeping the rest verbatim, including
        // whitespace, so multi-paragraph prompts survive.
        const stripped = raw.replace(/^\/system\s*/i, "");
        if (!stripped.trim()) {
            return {
                message: [
                    "Current system prompt:",
                    "",
                    state.systemPrompt,
                ].join("\n"),
            };
        }
        actions.setSystemPrompt(stripped);
        return { message: "System prompt updated." };
    },
};
