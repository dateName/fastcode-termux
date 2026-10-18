import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://api.groq.com/openai/v1";
const STATIC = [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout" },
    { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2" },
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
    { id: "qwen/qwen3-32b", label: "Qwen3 32B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B instant" },
];
export const groqProvider = {
    id: "groq",
    label: "Groq",
    authEnv: ["GROQ_API_KEY"],
    baseUrl: BASE,
    defaultModel: "llama-3.3-70b-versatile",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC, reasoning: "openai" }),
    supportsReasoning: () => true,
};
