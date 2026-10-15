/**
 * Built-in color themes. The `banner` triple is fed to gradient-string
 * (start → mid → end) so each theme produces a recognizable big-text logo.
 */
export declare const THEMES: {
    fastcode: {
        id: string;
        label: string;
        banner: string[];
        user: string;
        assistant: string;
        system: string;
        border: string;
        accent: string;
        muted: string;
        error: string;
        success: string;
    };
    neon: {
        id: string;
        label: string;
        banner: string[];
        user: string;
        assistant: string;
        system: string;
        border: string;
        accent: string;
        muted: string;
        error: string;
        success: string;
    };
    sunset: {
        id: string;
        label: string;
        banner: string[];
        user: string;
        assistant: string;
        system: string;
        border: string;
        accent: string;
        muted: string;
        error: string;
        success: string;
    };
    matrix: {
        id: string;
        label: string;
        banner: string[];
        user: string;
        assistant: string;
        system: string;
        border: string;
        accent: string;
        muted: string;
        error: string;
        success: string;
    };
    mono: {
        id: string;
        label: string;
        banner: string[];
        user: string;
        assistant: string;
        system: string;
        border: string;
        accent: string;
        muted: string;
        error: string;
        success: string;
    };
};
export declare const DEFAULT_THEME = "fastcode";
export declare function getTheme(id: any): any;
