export const cancelCommand = {
    name: "cancel",
    description: "Cancel the active agent run (soft keyboard alternative to Esc)",
    run({ state, actions }) {
        if (!state.busy)
            return { message: "Nothing is running." };
        actions.cancelRun();
        return { message: "Cancelling the active run…" };
    },
};
