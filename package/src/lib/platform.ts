/**
 * Cross-platform detection and small helpers.
 *
 * FastCode targets Termux, Linux, macOS, and Windows. Most of our
 * environment-aware behavior keys off these flags rather than scattering
 * `process.platform === "..."` checks across the codebase.
 */
import { platform, homedir } from "node:os";
export function detectPlatform() {
    // Termux exposes PREFIX=/data/data/com.termux/files/usr. The extra check
    // makes us robust to users who manually export PREFIX for other reasons.
    const prefix = process.env["PREFIX"];
    // Termux exports TERMUX_VERSION; PREFIX=/data/data/com.termux/files/usr is a
    // strong secondary signal. Neither requires the directory to exist yet.
    if (process.platform === "android" ||
        Boolean(process.env["TERMUX_VERSION"]) ||
        (prefix && prefix.includes("com.termux"))) {
        return "termux";
    }
    switch (process.platform) {
        case "linux":
        case "darwin":
        case "win32":
            return process.platform;
        default:
            return "other";
    }
}
export const isTermux = () => detectPlatform() === "termux";
export const isWindows = () => process.platform === "win32";
export const isMac = () => process.platform === "darwin";
/** Human-readable label for the status bar. */
export function platformLabel() {
    const p = detectPlatform();
    switch (p) {
        case "termux":
            return "Termux";
        case "linux":
            return "Linux";
        case "darwin":
            return "macOS";
        case "win32":
            return "Windows";
        default:
            return platform();
    }
}
export function safeHome() {
    // os.homedir() can return undefined on weird CI containers; fall back
    // to $HOME / %USERPROFILE% / cwd in that order.
    const fromOs = homedir();
    if (fromOs)
        return fromOs;
    return (process.env["HOME"] ??
        process.env["USERPROFILE"] ??
        process.cwd());
}
