import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://openrouter.ai/api/v1";
const STATIC = [
    { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
    { id: "openai/gpt-6-luna", label: "GPT-6 Luna" },
    { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { id: "x-ai/grok-4.7", label: "Grok 4.7" },
    { id: "moonshotai/kimi-k3", label: "Kimi K3" },
    { id: "z-ai/glm-5.3", label: "GLM 5.3" },
    { id: "qwen/qwen3.8-max", label: "Qwen3.8 Max" },
    { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
];
const EXTRA_HEADERS = {
    "http-referer": "https://github.com/dateName/fastcode-termux",
    "x-title": "FastCode",
};
export const openrouterProvider = {
    id: "openrouter",
    label: "OpenRouter (400+ models)",
    authEnv: ["OPENROUTER_API_KEY"],
    baseUrl: BASE,
    defaultModel: "anthropic/claude-sonnet-5.5",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC, extraHeaders: EXTRA_HEADERS }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC, extraHeaders: EXTRA_HEADERS }),
};
