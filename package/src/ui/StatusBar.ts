import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useStdout } from "ink";
import { platformLabel } from "../lib/platform.js";
export const StatusBar = ({ theme, providerId, model, inputTokens, outputTokens, costUsd, enabledSkillCount, reasoningEffort, hint, }) => {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? process.stdout.columns ?? 80;
    const compact = columns < 88;
    const cost = costUsd > 0 ? `$${costUsd.toFixed(4)}` : "$0.0000";
    const providerModel = `${providerId}/${model}`;
    const label = compact ? truncate(providerModel, Math.max(18, columns - 28)) : providerModel;
    const effort = reasoningEffort && reasoningEffort !== "auto" ? `effort:${reasoningEffort}` : "";
    return (_jsxs(Box, { flexDirection: compact ? "column" : "row", justifyContent: "space-between", borderStyle: "round", borderColor: theme.border, paddingX: 1, children: [_jsxs(Text, { color: theme.muted, children: [_jsx(Text, { color: theme.accent, children: "\u25CF" }), " ", label, _jsx(Text, { color: theme.muted, children: "  \u00B7  " }), inputTokens, "\u2191 ", outputTokens, "\u2193 ", cost, effort ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: theme.muted, children: "  \u00B7  " }), effort] })) : null, !compact ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: theme.muted, children: "  \u00B7  " }), "skills: ", enabledSkillCount, _jsx(Text, { color: theme.muted, children: "  \u00B7  " }), platformLabel()] })) : null] }), _jsx(Text, { color: theme.muted, children: compact
                    ? `${effort ? effort + " \u00B7 " : ""}${platformLabel()} \u00B7 skills:${enabledSkillCount} \u00B7 ${hint ?? "/help \u00B7 esc \u00B7 ctrl+c"}`
                    : hint ?? "/help \u00B7 esc cancel \u00B7 ctrl+c quit" })] }));
};
function truncate(value, max) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, Math.max(1, max - 1))}\u2026`;
}
