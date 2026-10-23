export const expandCommand = {
    name: "expand",
    description: "Toggle full tool output in the transcript (stable UI defaults to collapsed)",
    run({ state, actions }) {
        actions.setExpanded(!state.expanded);
        return { message: state.expanded ? "Tool output: collapsed." : "Tool output: expanded (new output only)." };
    },
};
