import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { renderMarkdown } from "../lib/markdown.js";
const SIGIL = {
    user: "▎ you",
    assistant: "▍ FastCode",
    system: "✦ system",
};
const markdownCache = new Map();
function cachedMarkdown(md) {
    const hit = markdownCache.get(md);
    if (hit !== undefined)
        return hit;
    const rendered = renderMarkdown(md);
    if (markdownCache.size > 200)
        markdownCache.clear();
    markdownCache.set(md, rendered);
    return rendered;
}
export const MessageBubble = ({ theme, role, content, streaming, markdown }: any) => {
    const color = role === "user" ? theme.user : role === "assistant" ? theme.assistant : theme.system;
    const display = markdown ? cachedMarkdown(content) : content;
    return (_jsxs(Box, { flexDirection: "column", marginY: 0, children: [_jsxs(Text, { color: color, bold: true, children: [SIGIL[role], streaming ? _jsx(Text, { color: theme.muted, children: "  (streaming)" }) : null] }), _jsx(Box, { marginLeft: 2, flexDirection: "column", children: _jsx(Text, { color: color, children: display || (streaming ? "…" : "") }) })] }));
};
