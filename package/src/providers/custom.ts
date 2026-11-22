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
/**
 * Optional overrides for gateways that do not use `Authorization: Bearer`:
 *   FASTCODE_AUTH_HEADER   header name (e.g. x-api-key / api-key)
 *   FASTCODE_AUTH_PREFIX   value prefix (default "" when a custom header is set)
 *   FASTCODE_EXTRA_HEADERS JSON object of extra string headers
 */
function authOptions() {
    const name = (process.env["FASTCODE_AUTH_HEADER"] ?? "").trim() || undefined;
    const prefix = process.env["FASTCODE_AUTH_PREFIX"];
    if (!name && prefix === undefined)
        return {};
    return { ...(name ? { authHeaderName: name } : {}), authPrefix: prefix ?? "" };
}
function extraHeaders() {
    const raw = (process.env["FASTCODE_EXTRA_HEADERS"] ?? "").trim();
    if (!raw)
        return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return undefined;
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string")
                headers[key] = value;
        }
        return headers;
    }
    catch {
        return undefined;
    }
}
export const customProvider = {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    authEnv: [],
    get baseUrl() {
        return baseUrl();
    },
    defaultModel: defaultModel(),
    listModels: () => listModelsHttp({ baseUrl: requireBaseUrl(), apiKey: process.env["FASTCODE_API_KEY"], staticModels: [], ...authOptions() }),
    stream: (req) => {
        const headers = extraHeaders();
        return streamChatCompletion(req, {
            providerId: "custom",
            baseUrl: requireBaseUrl(),
            apiKey: process.env["FASTCODE_API_KEY"],
            staticModels: [],
            ...authOptions(),
            ...(headers ? { extraHeaders: headers } : {}),
        });
    },
};
