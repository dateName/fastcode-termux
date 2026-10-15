import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://api.x.ai/v1";
const STATIC = [
    { id: "grok-4.7", label: "Grok 4.7" },
    { id: "grok-4.6", label: "Grok 4.6" },
    { id: "grok-4.5", label: "Grok 4.5" },
    { id: "grok-4.3", label: "Grok 4.3" },
    { id: "grok-4.20", label: "Grok 4.20" },
];
export const xaiProvider = {
    id: "xai",
    label: "xAI (Grok)",
    authEnv: ["XAI_API_KEY", "GROK_API_KEY"],
    baseUrl: BASE,
    defaultModel: "grok-4.7",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC }),
};
