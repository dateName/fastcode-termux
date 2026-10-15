import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
function baseUrl() {
    return (process.env["MOONSHOT_BASE_URL"] ?? "").trim() || "https://api.moonshot.cn/v1";
}
const STATIC = [
    { id: "kimi-k3", label: "Kimi K3" },
    { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
    { id: "kimi-k2.6", label: "Kimi K2.6" },
    { id: "kimi-k2-thinking", label: "Kimi K2 Thinking" },
    { id: "kimi-k2-0905", label: "Kimi K2 0905" },
];
export const moonshotProvider = {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    authEnv: ["MOONSHOT_API_KEY"],
    get baseUrl() {
        return baseUrl();
    },
    defaultModel: "kimi-k3",
    listModels: (apiKey) => listModelsHttp({ baseUrl: baseUrl(), apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: baseUrl(), apiKey, staticModels: STATIC }),
};
