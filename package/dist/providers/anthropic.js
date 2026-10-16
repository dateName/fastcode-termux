import { streamSSE } from "../lib/http.js";
const STATIC_MODELS = [
    { id: "claude-sonnet-5.5", label: "Claude Sonnet 5.5", contextWindow: 1000000, pricing: { inputUsdPerM: 3, outputUsdPerM: 15 } },
    { id: "claude-opus-5.5", label: "Claude Opus 5.5", contextWindow: 1000000, pricing: { inputUsdPerM: 15, outputUsdPerM: 75 } },
    { id: "claude-haiku-5.5", label: "Claude Haiku 5.5", contextWindow: 200000, pricing: { inputUsdPerM: 0.8, outputUsdPerM: 4 } },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4.6", label: "Claude Opus 4.6" },
    { id: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
];
const BASE = "https://api.anthropic.com/v1";
export const anthropicProvider = {
    id: "anthropic",
    label: "Anthropic (Claude)",
    authEnv: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    baseUrl: BASE,
    defaultModel: "claude-sonnet-5.5",
    async listModels() {
        return STATIC_MODELS;
    },
    async *stream(req, apiKey) {
        if (!apiKey) {
            throw new Error("Missing ANTHROPIC_API_KEY. Bind one with /login anthropic <model> <key>, or set the env var.");
        }
        const messages = req.messages.map((m) => ({ role: m.role, content: m.content }));
        const body = {
            model: req.model,
            messages,
            ...(req.system ? { system: req.system } : {}),
            stream: true,
            max_tokens: req.maxOutputTokens ?? 4096,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        };
        const res = await fetch(BASE + "/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                accept: "text/event-stream",
            },
            body: JSON.stringify(body),
            signal: req.signal,
        });
        let usageInput = 0;
        let usageOutput = 0;
        for await (const ev of streamSSE(res)) {
            let data;
            try {
                data = JSON.parse(ev.data);
            }
            catch {
                continue;
            }
            const t = data.type;
            if (t === "content_block_delta") {
                const delta = data.delta?.text;
                if (delta)
                    yield { delta, done: false };
            }
            else if (t === "message_start") {
                const u = data.message?.usage;
                if (u?.input_tokens)
                    usageInput = u.input_tokens;
            }
            else if (t === "message_delta") {
                const u = data.usage;
                if (u?.output_tokens)
                    usageOutput = u.output_tokens;
            }
            else if (t === "message_stop") {
                break;
            }
        }
        const cost = priceFor(req.model, usageInput, usageOutput);
        yield { delta: "", done: true, usage: { inputTokens: usageInput, outputTokens: usageOutput, costUsd: cost } };
    },
};
function priceFor(modelId, input, output) {
    const m = STATIC_MODELS.find((x) => x.id === modelId);
    const p = m?.pricing;
    if (!p?.inputUsdPerM || !p.outputUsdPerM)
        return undefined;
    return (input / 1000000) * p.inputUsdPerM + (output / 1000000) * p.outputUsdPerM;
}
