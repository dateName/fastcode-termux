import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Animated FastCode banner shown at startup.
 *
 * We render the wordmark with ink-big-text + a gradient that slowly cycles
 * through the theme's banner triple. The animation runs for ~1s and then
 * settles on a stable gradient so we don't waste GPU cycles forever.
 */
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
const FRAMES = 16;
export const Banner = ({ theme, subtitle, stable = false }) => {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (stable)
            return;
        if (frame >= FRAMES)
            return;
        const t = setTimeout(() => setFrame((f) => f + 1), 60);
        return () => clearTimeout(t);
    }, [frame, stable]);
    const t = stable ? 1 : Math.min(1, frame / FRAMES);
    const colors = rotate(theme.banner, t);
    return (_jsxs(Box, { flexDirection: "column", alignItems: "flex-start", marginBottom: 1, children: [_jsx(Gradient, { colors: colors, children: _jsx(BigText, { text: "FastCode", font: "block", space: false }) }), _jsx(Text, { color: theme.muted, children: subtitle ?? "multi-LLM TUI · skills.sh · slash commands · /help to start" })] }));
};
/** Cycle the gradient stops by `t ∈ [0,1]` for a subtle shimmer effect. */
function rotate(stops, t) {
    const [a, b, c] = stops;
    if (t < 0.33)
        return [a, b, c];
    if (t < 0.66)
        return [b, c, a];
    return [c, a, b];
}
