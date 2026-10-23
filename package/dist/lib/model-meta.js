import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export const UNKNOWN_MODEL_META = {
    contextWindow: 32_768,
    supportsTools: false,
    charsPerToken: 2.5,
};
const PROVIDER_META = {
    anthropic: { contextWindow: 1_000_000, supportsTools: true, charsPerToken: 3.8, maxOutputTokens: 64_000 },
    openai: { contextWindow: 400_000, supportsTools: true, charsPerToken: 3.8, maxOutputTokens: 32_000 },
    google: { contextWindow: 1_048_576, supportsTools: true, charsPerToken: 3.6, maxOutputTokens: 65_536 },
    deepseek: { contextWindow: 128_000, supportsTools: true, charsPerToken: 1.7, maxOutputTokens: 8_192 },
    openrouter: { contextWindow: 128_000, supportsTools: true, charsPerToken: 2.5, maxOutputTokens: 16_384 },
    groq: { contextWindow: 128_000, supportsTools: true, charsPerToken: 3.8, maxOutputTokens: 8_192 },
    mistral: { contextWindow: 128_000, supportsTools: true, charsPerToken: 3.8, maxOutputTokens: 8_192 },
    xai: { contextWindow: 256_000, supportsTools: true, charsPerToken: 3.8, maxOutputTokens: 16_384 },
    moonshot: { contextWindow: 256_000, supportsTools: true, charsPerToken: 2.0, maxOutputTokens: 16_384 },
    zhipu: { contextWindow: 128_000, supportsTools: true, charsPerToken: 1.7, maxOutputTokens: 8_192 },
    qwen: { contextWindow: 128_000, supportsTools: true, charsPerToken: 1.7, maxOutputTokens: 8_192 },
    ollama: { contextWindow: 32_768, supportsTools: true, charsPerToken: 2.5, maxOutputTokens: 4_096 },
    custom: { contextWindow: 32_768, supportsTools: false, charsPerToken: 2.5 },
};
const MODEL_OVERRIDES = {
    "claude-haiku-5.5": { contextWindow: 200_000 },
    "claude-haiku-4.5": { contextWindow: 200_000 },
    "claude-sonnet-5": { contextWindow: 1_000_000 },
    "claude-opus-5": { contextWindow: 1_000_000 },
    "claude-sonnet-4.6": { contextWindow: 1_000_000 },
    "claude-opus-4.6": { contextWindow: 1_000_000 },
    "gpt-4o": { contextWindow: 128_000 },
    "gpt-4o-mini": { contextWindow: 128_000 },
    "gpt-4.1": { contextWindow: 1_000_000 },
    o3: { contextWindow: 200_000 },
    "o4-mini": { contextWindow: 200_000 },
    "gemini-3.5-flash-lite": { contextWindow: 1_048_576 },
    "gemini-3.1-flash-lite": { contextWindow: 1_048_576 },
    "deepseek-v4-pro": { contextWindow: 128_000, charsPerToken: 1.7 },
    "deepseek-flash": { contextWindow: 128_000, charsPerToken: 1.7 },
    "glm-5.3": { contextWindow: 128_000, charsPerToken: 1.7 },
    "glm-5.2": { contextWindow: 128_000, charsPerToken: 1.7 },
    "qwen3.8-max": { contextWindow: 128_000, charsPerToken: 1.7 },
    "qwen3.8-flash": { contextWindow: 128_000, charsPerToken: 1.7 },
    "kimi-k3": { contextWindow: 256_000, charsPerToken: 2.0 },
    "grok-4.7": { contextWindow: 256_000, charsPerToken: 3.8 },
    "mistral-large-latest": { contextWindow: 128_000, charsPerToken: 3.8 },
};
let overrideCache;
export function modelMetaOverridePath() {
    const root = process.env["FASTCODE_HOME"] ?? join(homedir(), ".fastcode");
    return join(root, "model-meta.json");
}
export function clearModelMetaCache() {
    overrideCache = undefined;
}
function loadOverrides() {
    if (overrideCache)
        return overrideCache;
    const file = modelMetaOverridePath();
    if (!existsSync(file)) {
        overrideCache = {};
        return overrideCache;
    }
    try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        overrideCache = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    }
    catch {
        overrideCache = {};
    }
    return overrideCache;
}
function usable(meta) {
    return Boolean(meta) && typeof meta === "object";
}
function apply(base, ...layers) {
    const next = { ...base };
    for (const layer of layers) {
        if (!usable(layer))
            continue;
        if (typeof layer.contextWindow === "number" && layer.contextWindow > 0)
            next.contextWindow = Math.floor(layer.contextWindow);
        if (typeof layer.charsPerToken === "number" && layer.charsPerToken > 0)
            next.charsPerToken = layer.charsPerToken;
        if (typeof layer.supportsTools === "boolean")
            next.supportsTools = layer.supportsTools;
        if (typeof layer.maxOutputTokens === "number" && layer.maxOutputTokens > 0)
            next.maxOutputTokens = Math.floor(layer.maxOutputTokens);
    }
    return next;
}
export function getModelMeta(providerId, model) {
    const provider = providerId && PROVIDER_META[providerId] ? PROVIDER_META[providerId] : UNKNOWN_MODEL_META;
    const overrides = loadOverrides();
    const keys = [
        providerId && model ? `${providerId}/${model}` : undefined,
        providerId && model ? `${providerId}::${model}` : undefined,
        model,
    ].filter((key) => Boolean(key));
    const layers = keys.map((key) => overrides[key]);
    return apply(provider, model ? MODEL_OVERRIDES[model] : undefined, ...layers);
}
export function estTokens(text, options = {}) {
    if (!text)
        return 0;
    const ratio = typeof options === "number"
        ? options
        : options.charsPerToken ?? getModelMeta(options.providerId, options.model).charsPerToken;
    return Math.ceil(text.length / Math.max(0.1, ratio));
}
export function estMessagesTokens(messages, options = {}) {
    return messages.reduce((sum, message) => sum + estTokens(message.content ?? "", options), 0);
}
