import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Bottom prompt input, with a left-side caret + slash-command autocomplete.
 *
 * We re-use ink-text-input for low-level keyboard handling but wrap it with
 * a fixed caret indicator + autocomplete preview to mirror the look of
 * Claude Code's prompt.
 *
 * The caret used to blink on a 500 ms setInterval. That timer re-rendered the
 * whole input line twice a second, which on some terminals rewrote the line
 * while the text cursor was being re-positioned and made the caret occasionally
 * jump one column ahead after the first keystroke. A static caret removes the
 * timer-driven redraw; ink-text-input's own cursor still tracks the real caret.
 */
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { COMMANDS } from "../commands/index.js";
export const Prompt = ({ theme, value, onChange, onSubmit, disabled, placeholder, stable = false, mask, }) => {
    const suggestion = autocomplete(value);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: disabled ? theme.muted : theme.accent, paddingX: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: theme.accent, bold: true, children: "\u276F " }), disabled ? (_jsx(Text, { color: theme.muted, children: placeholder ?? "Working… (Esc to cancel)" })) : (_jsx(TextInput, { value: value, onChange: onChange, onSubmit: onSubmit, placeholder: placeholder ?? "Type a message or /help …", showCursor: !stable, mask: mask }))] }), !disabled && suggestion ? (_jsx(Box, { marginLeft: 2, children: _jsxs(Text, { color: theme.muted, children: ["\u21AA ", suggestion] }) })) : null] }));
};
function autocomplete(value) {
    if (!value.startsWith("/") || value.includes(" "))
        return undefined;
    const partial = value.slice(1).toLowerCase();
    if (!partial) {
        return COMMANDS.filter((c) => !c.hidden)
            .map((c) => `/${c.name}`)
            .slice(0, 6)
            .join("  ");
    }
    const matches = COMMANDS.filter((c) => !c.hidden &&
        (c.name.startsWith(partial) ||
            (c.aliases ?? []).some((a) => a.startsWith(partial))));
    if (matches.length === 0)
        return undefined;
    return matches.map((c) => `/${c.name} — ${c.description}`).slice(0, 4).join("\n  ");
}
