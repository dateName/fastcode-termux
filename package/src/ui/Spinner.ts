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
    useEffect(() => {
        if (stable)
            return;
        const id = setInterval(() => setTick((t) => t + 1), 80);
        return () => clearInterval(id);
    }, [stable]);
    const frame = stable ? "⠋" : FRAMES[tick % FRAMES.length];
    const verb = label ?? VERBS[Math.floor(tick / 24) % VERBS.length];
    return (_jsxs(Text, { color: theme.accent, children: [frame, " ", _jsxs(Text, { color: theme.muted, children: [verb, "\u2026"] })] }));
};
