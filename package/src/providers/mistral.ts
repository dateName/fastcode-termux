import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://api.mistral.ai/v1";
const STATIC = [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-medium-latest", label: "Mistral Medium" },
    { id: "mistral-small-latest", label: "Mistral Small" },
    { id: "codestral-latest", label: "Codestral" },
    { id: "devstral-medium-latest", label: "Devstral" },
    { id: "magistral-medium-latest", label: "Magistral" },
];
export const mistralProvider = {
    id: "mistral",
    label: "Mistral",
    authEnv: ["MISTRAL_API_KEY"],
    baseUrl: BASE,
    defaultModel: "mistral-small-latest",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC, reasoning: "openai" }),
    supportsReasoning: () => true,
};
