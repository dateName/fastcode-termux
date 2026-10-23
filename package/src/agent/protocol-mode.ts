import { getModelMeta } from "../lib/model-meta.js";

export type ToolProtocol = "legacy" | "native";
export type ToolCapability = "native" | "pseudo";

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

export function toolCapabilityKey(providerId: string, model: string): string {
    return `${providerId}::${model}`;
}

export function resolveToolProtocol(config: any, providerId: string, model: string, env = process.env): ToolProtocol {
    const mode = String(env["FASTCODE_TOOL_PROTOCOL"] ?? "legacy").trim().toLowerCase();
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

export function withToolCapability(config: any, providerId: string, model: string, capability: ToolCapability): any {
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

export function isNativeUnsupportedError(message: string): boolean {
    return /\b400\b/.test(message)
        && /tool|function/i.test(message)
        && /not supported|unsupported|unrecognized|unknown|invalid|does not support/i.test(message);
}
