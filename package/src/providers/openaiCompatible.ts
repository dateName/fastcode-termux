import { fetchJson, streamSSE } from "../lib/http.js";
/** Build a chat-completions body in the classic or the newer (compat) dialect. */
function buildBody(req, compat) {
    const messages = [];
    if (req.system)
        messages.push({ role: "system", content: req.system });
    for (const m of req.messages)
        messages.push({ role: m.role, content: m.content });
    const body: any = { model: req.model, messages, stream: true };
    if (req.maxOutputTokens !== undefined) {
        if (compat)
            body.max_completion_tokens = req.maxOutputTokens;
        else
            body.max_tokens = req.maxOutputTokens;
    }
    if (req.temperature !== undefined && !compat)
        body.temperature = req.temperature;
    return body;
}
export async function* streamChatCompletion(req, opts) {
    const send = async (compat) => {
        const headers = {
            "content-type": "application/json",
            accept: "text/event-stream",
            ...(opts.extraHeaders ?? {}),
        };
        if (opts.apiKey)
            headers["authorization"] = (opts.authHeader ?? "Bearer") + " " + opts.apiKey;
        return await fetch(trim(opts.baseUrl) + "/chat/completions", {
            method: "POST",
            headers,
            body: JSON.stringify(buildBody(req, compat)),
            signal: req.signal,
        });
    };
    let res = await send(false);
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // Newer OpenAI-style models reject max_tokens and temperature. Retry once
        // in the compatibility dialect before surfacing the real error.
        if (res.status === 400 && /max_tokens|max_completion_tokens|temperature|unsupported|unrecognized|unknown parameter/i.test(detail)) {
            res = await send(true);
        }
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(res.status + " " + res.statusText + ": " + body.slice(0, 500));
        }
    }
    let usage;
    for await (const ev of streamSSE(res)) {
        if (ev.data === "[DONE]")
            break;
        let payload;
        try {
            payload = JSON.parse(ev.data);
        }
        catch {
            continue;
        }
        const obj = payload;
        const choice = obj.choices?.[0];
        const raw = choice?.delta?.content ?? choice?.text;
        const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
        if (obj.usage) {
            usage = {
                inputTokens: obj.usage.prompt_tokens,
                outputTokens: obj.usage.completion_tokens,
                totalTokens: obj.usage.total_tokens,
            };
        }
        const text = typeof raw === "string"
            ? raw
            : Array.isArray(raw)
                ? raw.map((part) => (part?.text ?? "")).join("")
                : "";
        if (text)
            yield { delta: text, done: false };
        else if (typeof reasoning === "string" && reasoning)
            yield { delta: "", done: false, reasoning };
    }
    yield { delta: "", done: true, usage };
}
export async function listModelsHttp(opts) {
    const staticModels = opts.staticModels ?? [];
    if (!opts.apiKey && staticModels.length)
        return staticModels;
    try {
        const headers = {};
        if (opts.apiKey)
            headers["authorization"] = (opts.authHeader ?? "Bearer") + " " + opts.apiKey;
        const json = await fetchJson(trim(opts.baseUrl) + "/models", { headers });
        const ids = (json.data ?? [])
            .map((m) => m.id)
            .filter((id) => typeof id === "string" && id.length > 0);
        if (ids.length === 0)
            return staticModels;
        // The provider's live list is authoritative: show exactly what it
        // returns (enriched with our labels/pricing where the id is known).
        // Static models the provider no longer returns are dropped so delisted
        // models don't linger in the picker.
        const known = new Map(staticModels.map((m) => [m.id, m]));
        return ids.map((id) => known.get(id) ?? { id });
    }
    catch {
        return staticModels;
    }
}
function trim(url) {
    return url.replace(/[/]+$/, "");
}
