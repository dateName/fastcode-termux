export const clearCommand = {
    name: "clear",
    description: "Clear the current conversation history.",
    aliases: ["cls"],
    run({ actions }) {
        actions.clearHistory();
        return { message: "Conversation cleared.", silent: false };
    },
};
