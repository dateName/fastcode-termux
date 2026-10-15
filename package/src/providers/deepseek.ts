import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://api.deepseek.com/v1";
const STATIC = [
    { id: "deepseek-chat", label: "DeepSeek Chat (latest alias)" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner (latest alias)" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "deepseek-v3.2", label: "DeepSeek V3.2" },
];
export const deepseekProvider = {
    id: "deepseek",
    label: "DeepSeek",
    authEnv: ["DEEPSEEK_API_KEY"],
    baseUrl: BASE,
    defaultModel: "deepseek-chat",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC }),
};
