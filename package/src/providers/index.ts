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
