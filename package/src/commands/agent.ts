export const agentCommand = {
    name: "agent",
    description: "Toggle coding-agent tools. Usage: /agent [on|off|status]",
    run({ args, state, actions }) {
        if (args.length === 0) {
            return {
                message: `Agent mode: ${state.agentMode ? "on" : "off"}`,
                picker: {
                    title: "Agent mode",
                    current: state.agentMode ? "on" : "off",
                    items: [
                        { value: "on", label: "on", hint: "allow shell and file tools" },
                        { value: "off", label: "off", hint: "chat only; no local tool execution" },
                    ],
                    onSelect: (value) => {
                        const enabled = value === "on";
                        actions.setAgentMode(enabled);
                        actions.pushSystemMessage(enabled
                            ? "Agent mode enabled. FastCode can run shell and file tools."
                            : "Agent mode disabled.");
                    },
                },
            };
        }
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
