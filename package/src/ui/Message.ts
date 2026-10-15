import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { renderMarkdown } from "../lib/markdown.js";
const SIGIL = {
    user: "▎ you",
    assistant: "▍ FastCode",
    system: "✦ system",
};
export const MessageBubble = ({ theme, role, content, streaming, markdown, }) => {
    const color = role === "user" ? theme.user : role === "assistant" ? theme.assistant : theme.system;
    const display = markdown ? renderMarkdown(content) : content;
    return (_jsxs(Box, { flexDirection: "column", marginY: 0, children: [_jsxs(Text, { color: color, bold: true, children: [SIGIL[role], streaming ? _jsx(Text, { color: theme.muted, children: "  (streaming)" }) : null] }), _jsx(Box, { marginLeft: 2, flexDirection: "column", children: _jsx(Text, { color: color, children: display || (streaming ? "…" : "") }) })] }));
};
