export declare function detectPlatform(): "darwin" | "linux" | "win32" | "termux" | "other";
export declare const isTermux: () => boolean;
export declare const isWindows: () => boolean;
export declare const isMac: () => boolean;
/** Human-readable label for the status bar. */
export declare function platformLabel(): NodeJS.Platform | "Termux" | "Linux" | "macOS" | "Windows";
export declare function safeHome(): string;
