/**
 * Built-in color themes. The `banner` triple is fed to gradient-string
 * (start → mid → end) so each theme produces a recognizable big-text logo.
 */
export const THEMES = {
    fastcode: {
        id: "fastcode",
        label: "FastCode (default)",
        banner: ["#ff7a00", "#ff2d95", "#7c4dff"],
        user: "cyan",
        assistant: "white",
        system: "gray",
        border: "magenta",
        accent: "magenta",
        muted: "gray",
        error: "red",
        success: "green",
    },
    neon: {
        id: "neon",
        label: "Neon",
        banner: ["#00ffd0", "#00b3ff", "#7c4dff"],
        user: "cyanBright",
        assistant: "whiteBright",
        system: "gray",
        border: "cyan",
        accent: "cyan",
        muted: "gray",
        error: "red",
        success: "greenBright",
    },
    sunset: {
        id: "sunset",
        label: "Sunset",
        banner: ["#ff5f6d", "#ffc371", "#ff9966"],
        user: "yellow",
        assistant: "whiteBright",
        system: "gray",
        border: "yellow",
        accent: "yellow",
        muted: "gray",
        error: "redBright",
        success: "green",
    },
    matrix: {
        id: "matrix",
        label: "Matrix",
        banner: ["#00ff41", "#008f11", "#003b00"],
        user: "greenBright",
        assistant: "green",
        system: "gray",
        border: "green",
        accent: "green",
        muted: "gray",
        error: "redBright",
        success: "greenBright",
    },
    mono: {
        id: "mono",
        label: "Monochrome",
        banner: ["#ffffff", "#cccccc", "#888888"],
        user: "white",
        assistant: "whiteBright",
        system: "gray",
        border: "white",
        accent: "white",
        muted: "gray",
        error: "red",
        success: "white",
    },
};
export const DEFAULT_THEME = "fastcode";
export function getTheme(id) {
    if (id && THEMES[id])
        return THEMES[id];
    return THEMES[DEFAULT_THEME];
}
