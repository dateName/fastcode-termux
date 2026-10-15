import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
function baseUrl() {
    return (process.env["ZHIPU_BASE_URL"] ?? "").trim() || "https://open.bigmodel.cn/api/paas/v4";
}
const STATIC = [
    { id: "glm-5.3", label: "GLM 5.3" },
    { id: "glm-5.2", label: "GLM 5.2" },
    { id: "glm-5.1", label: "GLM 5.1" },
    { id: "glm-5", label: "GLM 5" },
    { id: "glm-4.7", label: "GLM 4.7" },
    { id: "glm-4.6", label: "GLM 4.6" },
];
export const zhipuProvider = {
    id: "zhipu",
    label: "Zhipu (GLM)",
    authEnv: ["ZHIPUAI_API_KEY", "GLM_API_KEY", "ZHIPU_API_KEY"],
    get baseUrl() {
        return baseUrl();
    },
    defaultModel: "glm-5.3",
    listModels: (apiKey) => listModelsHttp({ baseUrl: baseUrl(), apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: baseUrl(), apiKey, staticModels: STATIC }),
};
