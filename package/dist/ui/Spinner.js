import { jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Custom thinking spinner.
 *
 * We don't use ink-spinner's built-in spinners directly because we want to
 * (1) cycle through a varied set of action verbs ("Thinking…", "Pondering…")
 * and (2) keep the dots animation in sync with the verb rotation.
 */
import { useEffect, useState } from "react";
import { Text } from "ink";
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const VERBS = [
    "Thinking",
    "Pondering",
    "Reasoning",
    "Cooking",
    "Crafting",
    "Brewing",
    "Sketching",
    "Charging",
];
export const Spinner = ({ theme, label, stable = false }) => {
    const [tick, setTick] = useState(0);
    // stable UI only lowers the redraw rate; it must still animate. A frozen
    // frame made long waits look like a hang.
    const configured = Number(process.env["FASTCODE_SPINNER_MS"]);
    const interval = Number.isFinite(configured) && configured >= 60
        ? configured
        : stable
            ? 120
            : 80;
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), interval);
        return () => clearInterval(id);
    }, [interval]);
    const frame = FRAMES[tick % FRAMES.length];
    const verb = label ?? VERBS[Math.floor(tick / 24) % VERBS.length];
    return (_jsxs(Text, { color: theme.accent, children: [frame, " ", _jsxs(Text, { color: theme.muted, children: [verb, "\u2026"] })] }));
};
