export const expandCommand = {
    name: "expand",
    description: "Toggle full tool output; /expand <id> replays a stored result and its diff",
    run({ args, state, actions }) {
        if (args?.[0])
            return { expandTool: String(args[0]) };
        actions.setExpanded(!state.expanded);
        return { message: state.expanded ? "Tool output: collapsed." : "Tool output: expanded (new output only)." };
    },
};
