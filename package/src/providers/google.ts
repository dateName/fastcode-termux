import { listModelsHttp, streamChatCompletion } from "./openaiCompatible.js";
const BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const STATIC = [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
    { id: "gemini-4-argon", label: "Gemini 4 Argon" },
];
export const googleProvider = {
    id: "google",
    label: "Google Gemini",
    authEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseUrl: BASE,
    defaultModel: "gemini-3.8-flash",
    listModels: (apiKey) => listModelsHttp({ baseUrl: BASE, apiKey, staticModels: STATIC }),
    stream: (req, apiKey) => streamChatCompletion(req, { baseUrl: BASE, apiKey, staticModels: STATIC }),
};
