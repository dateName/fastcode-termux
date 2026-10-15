export const agentCommand = {
    name: "agent",
    description: "Toggle coding-agent tools. Usage: /agent [on|off|status]",
    run({ args, state, actions }) {
        const sub = (args[0] ?? "status").toLowerCase();
        if (sub === "on") {
            actions.setAgentMode(true);
            return { message: "Agent mode enabled. FastCode can run shell and file tools." };
        }
        if (sub === "off") {
            actions.setAgentMode(false);
            return { message: "Agent mode disabled." };
        }
        return {
            message: `Agent mode: ${state.agentMode ? "on" : "off"}\n\nUse /agent on to let FastCode run local shell and file tools.`,
        };
    },
};
