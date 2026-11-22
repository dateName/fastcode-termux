import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ModelPricing {
  inputUsdPerM?: number;
  outputUsdPerM?: number;
}

export interface ModelMeta {
  contextWindow: number;
  supportsTools: boolean;
  charsPerToken: number;
  maxOutputTokens?: number;
  pricing?: ModelPricing;
}

/** Date of the built-in model/context/pricing snapshot. */
export const MODEL_META_UPDATED = "2026-11-21";

export interface EstTokenOptions {
  providerId?: string;
  model?: string;
  charsPerToken?: number;
}

export const UNKNOWN_MODEL_META: ModelMeta = {
  contextWindow: 32_768,
  supportsTools: false,
  charsPerToken: 2.5,
};

const PROVIDER_META: Record<string, ModelMeta> = {
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

const MODEL_OVERRIDES: Record<string, Partial<ModelMeta>> = {
  "claude-haiku-5.5": { contextWindow: 200_000, pricing: { inputUsdPerM: 0.8, outputUsdPerM: 4 } },
  "claude-haiku-4.5": { contextWindow: 200_000 },
  "claude-sonnet-5.5": { contextWindow: 1_000_000, pricing: { inputUsdPerM: 3, outputUsdPerM: 15 } },
  "claude-opus-5.5": { contextWindow: 1_000_000, pricing: { inputUsdPerM: 15, outputUsdPerM: 75 } },
  "claude-sonnet-5": { contextWindow: 1_000_000 },
  "claude-opus-5": { contextWindow: 1_000_000 },
  "claude-sonnet-4.6": { contextWindow: 1_000_000 },
  "claude-opus-4.6": { contextWindow: 1_000_000 },
  "gpt-4o": { contextWindow: 128_000, pricing: { inputUsdPerM: 2.5, outputUsdPerM: 10 } },
  "gpt-4o-mini": { contextWindow: 128_000, pricing: { inputUsdPerM: 0.15, outputUsdPerM: 0.6 } },
  "gpt-4.1": { contextWindow: 1_000_000, pricing: { inputUsdPerM: 2, outputUsdPerM: 8 } },
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

let overrideCache: Record<string, Partial<ModelMeta>> | undefined;

export function modelMetaOverridePath(): string {
  const root = process.env["FASTCODE_HOME"] ?? join(homedir(), ".fastcode");
  return join(root, "model-meta.json");
}

export function clearModelMetaCache(): void {
  overrideCache = undefined;
}

function loadOverrides(): Record<string, Partial<ModelMeta>> {
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

function usable(meta: Partial<ModelMeta> | undefined): meta is Partial<ModelMeta> {
  return Boolean(meta) && typeof meta === "object";
}

function apply(base: ModelMeta, ...layers: Array<Partial<ModelMeta> | undefined>): ModelMeta {
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
    if (layer.pricing && typeof layer.pricing === "object") {
      const pricing: ModelPricing = { ...(next.pricing ?? {}) };
      if (typeof layer.pricing.inputUsdPerM === "number" && Number.isFinite(layer.pricing.inputUsdPerM) && layer.pricing.inputUsdPerM >= 0)
        pricing.inputUsdPerM = layer.pricing.inputUsdPerM;
      if (typeof layer.pricing.outputUsdPerM === "number" && Number.isFinite(layer.pricing.outputUsdPerM) && layer.pricing.outputUsdPerM >= 0)
        pricing.outputUsdPerM = layer.pricing.outputUsdPerM;
      if (Object.keys(pricing).length > 0)
        next.pricing = pricing;
    }
  }
  return next;
}

function overrideKeys(providerId?: string, model?: string): string[] {
  return [
    providerId && model ? `${providerId}/${model}` : undefined,
    providerId && model ? `${providerId}::${model}` : undefined,
    model,
  ].filter((key): key is string => Boolean(key));
}

export function getModelMeta(providerId?: string, model?: string): ModelMeta {
  const provider = providerId && PROVIDER_META[providerId] ? PROVIDER_META[providerId] : UNKNOWN_MODEL_META;
  const overrides = loadOverrides();
  const layers = overrideKeys(providerId, model).map((key) => overrides[key]);
  return apply(provider, model ? MODEL_OVERRIDES[model] : undefined, ...layers);
}

export function modelMetaSource(providerId?: string, model?: string): "override" | "built-in" | "default" {
  const overrides = loadOverrides();
  if (overrideKeys(providerId, model).some((key) => Boolean(overrides[key])))
    return "override";
  if ((providerId && PROVIDER_META[providerId]) || (model && MODEL_OVERRIDES[model]))
    return "built-in";
  return "default";
}

export function estimateCostUsd(inputTokens: number, outputTokens: number, pricing: ModelPricing | undefined): number | undefined {
  if (!pricing)
    return undefined;
  const input = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const output = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  const cost = (input / 1_000_000) * (pricing.inputUsdPerM ?? 0) +
    (output / 1_000_000) * (pricing.outputUsdPerM ?? 0);
  return Number.isFinite(cost) && cost > 0 ? cost : undefined;
}

export function estTokens(text: string, options: number | EstTokenOptions = {}): number {
  if (!text)
    return 0;
  const ratio = typeof options === "number"
    ? options
    : options.charsPerToken ?? getModelMeta(options.providerId, options.model).charsPerToken;
  return Math.ceil(text.length / Math.max(0.1, ratio));
}

export function estMessagesTokens(messages: Array<{ content: string }>, options: EstTokenOptions = {}): number {
  return messages.reduce((sum, message) => sum + estTokens(message.content ?? "", options), 0);
}
