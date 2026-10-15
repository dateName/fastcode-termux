import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
function baseUrl() {
    return (process.env["DASHSCOPE_BASE_URL"] ?? "").trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";
}
const STATIC = [
    { id: "qwen3.8-max", label: "Qwen3.8 Max" },
    { id: "qwen3.8-flash", label: "Qwen3.8 Flash" },
    { id: "qwen3.7-max", label: "Qwen3.7 Max" },
    { id: "qwen3.7-plus", label: "Qwen3.7 Plus" },
    { id: "qwen3-coder-next", label: "Qwen3 Coder Next" },
    { id: "qwen3.6-27b", label: "Qwen3.6 27B" },
];
export const qwenProvider = {
    id: "qwen",
    label: "Qwen (DashScope)",
    authEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    get baseUrl() {
        return baseUrl();
    },
    defaultModel: "qwen3.8-max",
    listModels: (apiKey) => listModelsHttp({ baseUrl: baseUrl(), apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: baseUrl(), apiKey, staticModels: STATIC }),
};
