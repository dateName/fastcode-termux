export const steerCommand = {
    name: "steer",
    description: "Add guidance to the next request of an active run (/steer <text>)",
    run({ args, state, actions }) {
        const text = args.join(" ").trim();
        if (!text)
            return { message: "Usage: /steer <guidance>" };
        if (!state.busy)
            return { message: "No active run. Just send the guidance as the next message." };
        actions.steer(text);
        return { message: "Steering queued for the next request." };
    },
};
