import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://api.openai.com/v1";
const STATIC = [
    { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
    { id: "gpt-6.1-sol-pro", label: "GPT-6.1 Sol Pro" },
    { id: "gpt-6-luna", label: "GPT-6 Luna" },
    { id: "gpt-6-luna-pro", label: "GPT-6 Luna Pro" },
    { id: "gpt-6-sol", label: "GPT-6 Sol" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { id: "gpt-4.1", label: "GPT-4.1", pricing: { inputUsdPerM: 2, outputUsdPerM: 8 } },
    { id: "gpt-4o", label: "GPT-4o", pricing: { inputUsdPerM: 2.5, outputUsdPerM: 10 } },
    { id: "gpt-4o-mini", label: "GPT-4o mini", pricing: { inputUsdPerM: 0.15, outputUsdPerM: 0.6 } },
    { id: "o4-mini", label: "o4-mini" },
    { id: "o3", label: "o3" },
];
export const openaiProvider = {
    id: "openai",
    label: "OpenAI",
    authEnv: ["OPENAI_API_KEY"],
    baseUrl: BASE,
    defaultModel: "gpt-6-luna",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC }),
};
