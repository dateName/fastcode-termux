import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Presentational picker used by /model, /provider, and /effort.
 *
 * Keyboard handling lives in App so it can suspend the normal prompt input and
 * so every picker behaves the same. This component only renders the window of
 * items around the active index.
 */
import { Box, Text } from "ink";
const WINDOW = 10;
export const Picker = ({ theme, title, items, index, current, hint }) => {
    const max = Math.max(0, items.length - 1);
    const active = Math.max(0, Math.min(index, max));
    const start = Math.max(0, Math.min(active - Math.floor(WINDOW / 2), Math.max(0, items.length - WINDOW)));
    const visible = items.slice(start, start + WINDOW);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: theme.accent, paddingX: 1, children: [_jsx(Text, { color: theme.accent, bold: true, children: title }), ...visible.map((item, offset) => {
                const itemIndex = start + offset;
                const selected = itemIndex === active;
                const marker = selected ? "\u276F" : " ";
                const number = itemIndex < 9 ? String(itemIndex + 1) : " ";
                const isCurrent = current !== undefined && item.value === current;
                return (_jsxs(Text, { color: selected ? theme.accent : theme.muted, children: [marker, " ", number, ". ", isCurrent ? "\u25CF " : "  ", item.label, item.hint ? _jsxs(Text, { color: theme.muted, children: ["  ", item.hint] }) : null] }, item.value));
            }), items.length > WINDOW ? (_jsx(Text, { color: theme.muted, children: `  … ${start + 1}-${start + visible.length} of ${items.length}` })) : null, _jsx(Text, { color: theme.muted, children: hint ?? "  \u2191/\u2193 select \u00B7 1-9 jump \u00B7 Enter confirm \u00B7 Esc cancel" })] }));
};
