import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Animated FastCode banner shown at startup.
 *
 * We render the wordmark with ink-big-text + a gradient that slowly cycles
 * through the theme's banner triple. The animation runs for ~1s and then
 * settles on a stable gradient so we don't waste GPU cycles forever.
 *
 * The font is chosen to fit the terminal: `block` needs ~74 columns, so on a
 * narrow phone terminal we fall back to progressively smaller fonts (see
 * BANNER_FONTS). If even the smallest font is wider than the terminal, the
 * banner is skipped entirely.
 */
import { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
const FRAMES = 16;
// (font, columns) needed to render the literal text "FastCode" with
// letterSpacing 1 and space:false. Measured with cfonts; largest first.
const BANNER_FONTS = [
    { font: "block", columns: 74 },
    { font: "simple", columns: 56 },
    { font: "slick", columns: 49 },
    { font: "shade", columns: 39 },
    { font: "chrome", columns: 32 },
    { font: "console", columns: 16 },
];
/** Pick the largest font that fits `columns` (2 columns reserved for padding). */
function pickBannerFont(columns) {
    const usable = columns - 2;
    for (const entry of BANNER_FONTS) {
        if (entry.columns <= usable)
            return entry.font;
    }
    return null;
}
export const Banner = ({ theme, subtitle, stable = false }) => {
    const [frame, setFrame] = useState(0);
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? process.stdout.columns ?? 80;
    const font = pickBannerFont(columns);
    useEffect(() => {
        if (stable)
            return;
        if (frame >= FRAMES)
            return;
        const t = setTimeout(() => setFrame((f) => f + 1), 60);
        return () => clearTimeout(t);
    }, [frame, stable]);
    if (!font)
        return null;
    const t = stable ? 1 : Math.min(1, frame / FRAMES);
    const colors = rotate(theme.banner, t);
    return (_jsxs(Box, { flexDirection: "column", alignItems: "flex-start", marginBottom: 1, children: [_jsx(Gradient, { colors: colors, children: _jsx(BigText, { text: "FastCode", font: font, space: false }) }), _jsx(Text, { color: theme.muted, children: subtitle ?? "multi-LLM TUI · skills.sh · slash commands · /help to start" })] }));
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
