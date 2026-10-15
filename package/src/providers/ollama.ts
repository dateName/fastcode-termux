import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
function baseUrl() {
    const host = (process.env["OLLAMA_HOST"] ?? "").trim() || "http://localhost:11434";
    return host.endsWith("/v1") ? host : host + "/v1";
}
const STATIC = [
    { id: "qwen3-coder", label: "qwen3-coder (local)" },
    { id: "llama3.2", label: "llama3.2 (local)" },
    { id: "gpt-oss", label: "gpt-oss (local)" },
    { id: "deepseek-r1", label: "deepseek-r1 (local)" },
];
export const ollamaProvider = {
    id: "ollama",
    label: "Ollama (local)",
    authEnv: [],
    get baseUrl() {
        return baseUrl();
    },
    defaultModel: "qwen3-coder",
    listModels: () => listModelsHttp({ baseUrl: baseUrl(), apiKey: undefined, staticModels: STATIC }),
    stream: (req) => streamChatCompletion(req, { baseUrl: baseUrl(), apiKey: undefined, staticModels: STATIC }),
};
