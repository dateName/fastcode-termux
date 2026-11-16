import { getModelMeta } from "../lib/model-meta.js";
const NATIVE_PROVIDERS = new Set([
    "openai",
    "openrouter",
    "deepseek",
    "groq",
    "mistral",
    "xai",
    "moonshot",
    "zhipu",
    "qwen",
    "ollama",
]);
export function toolCapabilityKey(providerId, model) {
    return `${providerId}::${model}`;
}
// Process-level negative/positive capability memory. A fallback or a confirmed
// native turn must not rewrite config.json: persisting a capability snapshot
// would also persist unrelated defaults (egress, providers) and leak state
// across unrelated setups. It only needs to affect this process.
const runtimeCapabilities = new Map();
export function rememberToolCapability(providerId, model, capability) {
    runtimeCapabilities.set(toolCapabilityKey(providerId, model), capability);
}
export function resolveToolProtocol(config, providerId, model, env = process.env) {
    const mode = String(env["FASTCODE_TOOL_PROTOCOL"] ?? "auto").trim().toLowerCase();
    if (mode === "legacy")
        return "legacy";
    if (mode === "native")
        return "native";
    if (mode !== "auto")
        return "legacy";
    const runtime = runtimeCapabilities.get(toolCapabilityKey(providerId, model));
    if (runtime === "pseudo")
        return "legacy";
    if (runtime === "native")
        return "native";
    const cached = config?.capabilities?.toolCalling?.[toolCapabilityKey(providerId, model)];
    if (cached === "pseudo")
        return "legacy";
    if (cached === "native")
        return "native";
    if (!NATIVE_PROVIDERS.has(providerId))
        return "legacy";
    return getModelMeta(providerId, model).supportsTools ? "native" : "legacy";
}
export function withToolCapability(config, providerId, model, capability) {
    const key = toolCapabilityKey(providerId, model);
    return {
        ...config,
        capabilities: {
            ...(config?.capabilities ?? {}),
            toolCalling: {
                ...(config?.capabilities?.toolCalling ?? {}),
                [key]: capability,
            },
        },
    };
}
export function isNativeUnsupportedError(message) {
    // Structural check: only a 4xx that explicitly says tools/functions are
    // unsupported/unknown means native calls are unavailable. A history-shape
    // 400 ("tool_calls must be followed by tool messages") is NOT a protocol
    // downgrade signal — it must be repaired and retried on the same protocol.
    if (!/\b(400|422|501)\b/.test(message))
        return false;
    if (isToolPairingError(message))
        return false;
    return /tool|function/i.test(message)
        && /unsupported|not supported|does not support|unknown|unrecognized|invalid/i.test(message);
}
export function isToolPairingError(message) {
    return /\b400\b/.test(message)
        && /tool_calls?|tool messages?/i.test(message)
        && /follow|paired|preced/i.test(message);
}
