import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
function baseUrl() {
    return (process.env["FASTCODE_BASE_URL"] ?? "").trim().replace(/[/]+$/, "");
}
function defaultModel() {
    return (process.env["FASTCODE_MODEL"] ?? "").trim() || "gpt-4o-mini";
}
function requireBaseUrl() {
    const base = baseUrl();
    if (!base) {
        throw new Error("FASTCODE_BASE_URL is not set. Example: export FASTCODE_BASE_URL=https://api.example.com/v1");
    }
    return base;
}
export const customProvider = {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    authEnv: [],
    get baseUrl() {
        return baseUrl();
    },
    defaultModel: defaultModel(),
    listModels: () => listModelsHttp({ baseUrl: requireBaseUrl(), apiKey: process.env["FASTCODE_API_KEY"], staticModels: [] }),
    stream: (req) => streamChatCompletion(req, { baseUrl: requireBaseUrl(), apiKey: process.env["FASTCODE_API_KEY"], staticModels: [] }),
};
