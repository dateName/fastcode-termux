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
import type { Provider } from "../types.js";
export const PROVIDERS: Provider[] = [
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
 * the UI cannot tell a live catalog from a cached one.
 */
export async function probeProvider(provider, apiKey, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const base = String(provider.baseUrl).replace(/[/]+$/, "");
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
        const res = await fetch(base + "/models", { headers, signal: controller.signal });
        return res.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
