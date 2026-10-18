import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://api.deepseek.com/v1";
const STATIC = [
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { id: "deepseek-flash", label: "DeepSeek Flash" },
];
export const deepseekProvider = {
    id: "deepseek",
    label: "DeepSeek",
    authEnv: ["DEEPSEEK_API_KEY"],
    baseUrl: BASE,
    defaultModel: "deepseek-v4-pro",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC, reasoning: "openai" }),
    supportsReasoning: () => true,
};
