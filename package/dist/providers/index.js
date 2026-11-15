import { anthropicProvider } from "./anthropic.js";
import { openaiProvider } from "./openai.js";
import { googleProvider } from "./google.js";
import { openrouterProvider } from "./openrouter.js";
import { groqProvider } from "./groq.js";
import { deepseekProvider } from "./deepseek.js";
import { mistralProvider } from "./mistral.js";
import { ollamaProvider } from "./ollama.js";
import { xaiProvider } from "./xai.js";
import { moonshotProvider } from "./moonshot.js";
import { zhipuProvider } from "./zhipu.js";
import { qwenProvider } from "./qwen.js";
import { customProvider } from "./custom.js";
import { CATALOG_PROVIDERS } from "./catalog.js";
import { resolveBaseUrl } from "./spec.js";
export const PROVIDERS = [
    anthropicProvider,
    openaiProvider,
    googleProvider,
    deepseekProvider,
    openrouterProvider,
    groqProvider,
    mistralProvider,
    xaiProvider,
    moonshotProvider,
    zhipuProvider,
    qwenProvider,
    ollamaProvider,
    ...CATALOG_PROVIDERS,
    customProvider,
];
export function getProvider(id) {
    return PROVIDERS.find((p) => p.id === id);
}
export function getProviderOrThrow(id) {
    const p = getProvider(id);
    if (!p)
        throw new Error("Unknown provider: " + id);
    return p;
}
/**
 * Cheap connectivity check used by the model picker to label a list "offline".
 * `listModels()` silently falls back to the static list, so without this probe
 * the UI cannot tell a live catalog from a cached one. The detailed form keeps
 * the reason: DNS/timeout/401 are "offline", a missing /models is "unsupported".
 */
export async function probeProviderDetailed(provider, apiKey, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        // Providers without /models (Bedrock, Vertex, …) cannot be probed this
        // way; report them as reachable instead of falsely labeling "offline".
        if (provider.modelsPath === null)
            return { ok: true, reason: "no /models endpoint (static catalog)" };
        const base = resolveBaseUrl({ baseUrl: String(provider.baseUrl) }).replace(/[/]+$/, "");
        const headers = { accept: "application/json" };
        if (apiKey) {
            if (provider.id === "anthropic") {
                headers["x-api-key"] = apiKey;
                headers["anthropic-version"] = "2023-06-01";
            }
            else {
                headers["authorization"] = "Bearer " + apiKey;
            }
        }
        const res = await fetch(base + (provider.modelsPath ?? "/models"), { headers, signal: controller.signal });
        if (res.ok)
            return { ok: true, reason: "ok", status: res.status };
        return {
            ok: false,
            reason: `HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}`,
            status: res.status,
        };
    }
    catch (err) {
        return {
            ok: false,
            reason: err?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : (err?.message ?? String(err)),
        };
    }
    finally {
        clearTimeout(timer);
    }
}
export async function probeProvider(provider, apiKey, timeoutMs = 4000) {
    return (await probeProviderDetailed(provider, apiKey, timeoutMs)).ok;
}
