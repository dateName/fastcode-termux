import { detectPlatform } from "./platform.js";
export function shouldUseStableTerminalUi(platform = detectPlatform(), env = process.env) {
    return platform === "termux" || env.FASTCODE_STABLE_UI === "1";
}
export function shouldUseLiveStreamingUi(platform = detectPlatform(), env = process.env) {
    return !shouldUseStableTerminalUi(platform, env);
}
