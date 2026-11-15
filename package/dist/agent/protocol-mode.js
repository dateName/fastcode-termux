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
export function resolveToolProtocol(config, providerId, model, env = process.env) {
    const mode = String(env["FASTCODE_TOOL_PROTOCOL"] ?? "auto").trim().toLowerCase();
    if (mode === "legacy")
        return "legacy";
    if (mode === "native")
        return "native";
    if (mode !== "auto")
        return "legacy";
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
    // Structural check: a 4xx about tools/functions means this endpoint did
    // not accept native tool_calls. Do not require specific wording — the real
    // 400 ("tool_calls must be followed by tool messages") has none of it.
    return /\b(400|422|501)\b/.test(message) && /tool|function/i.test(message);
}
