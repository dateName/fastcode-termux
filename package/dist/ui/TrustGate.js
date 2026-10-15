import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * First-run confirmation for a folder the agent is not trusted with yet.
 *
 * Agent tools can read, write, delete and execute in the workspace, so the user
 * decides before anything loads.
 */
import { Box, Text, useInput } from "ink";
export const TrustGate = ({ theme, cwd, onDecision }) => {
    useInput((input) => {
        const value = String(input ?? "").toLowerCase();
        if (value === "y")
            onDecision(true);
        else if (value === "n" || value === "q")
            onDecision(false);
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.accent, paddingX: 1, marginTop: 1, children: [
            _jsx(Text, { color: theme.accent, bold: true, children: "Trust this folder?" }),
            _jsx(Text, { color: theme.muted, children: cwd }),
            _jsx(Text, { children: "" }),
            _jsx(Text, { children: "FastCode agent tools can read, write and delete files here, and run shell commands." }),
            _jsx(Text, { children: "Continue only if you trust this project." }),
            _jsx(Text, { children: "" }),
            _jsx(Text, { children: "[y] trust and continue    [n] decline (chat only)    [q] quit" }),
        ] }));
};
