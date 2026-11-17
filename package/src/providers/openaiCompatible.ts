import type { NativeToolCall } from "../types.js";
import { fetchJson, streamSSE } from "../lib/http.js";
import { finalizeToolCalls, mergeToolCallDelta, type ToolCallAccumulator } from "../lib/native-tools.js";
import { buildHeaders, buildRequestUrl, type RequestSpec } from "./spec.js";

export interface ModelInfo {
    id: string;
    label?: string;
    [key: string]: any;
}

export interface StreamOptions {
    baseUrl: string;
    apiKey?: string;
    chatPath?: string;
    modelsPath?: string | null;
    query?: Record<string, string>;
    pathParams?: Record<string, string>;
    authHeaderName?: string;
    authPrefix?: string;
    staticModels?: ModelInfo[];
    extraHeaders?: Record<string, string>;
    /** Legacy auth prefix, e.g. "Bearer". Prefer authPrefix for new callers. */
    authHeader?: string;
    reasoning?: "openai" | "openrouter" | "none" | string;
}

export function toRequestSpec(opts: StreamOptions): RequestSpec {
    return {
        baseUrl: trim(opts.baseUrl),
        chatPath: opts.chatPath,
        modelsPath: opts.modelsPath,
        query: opts.query,
        pathParams: opts.pathParams,
        authHeaderName: opts.authHeaderName,
        authPrefix: opts.authPrefix ?? (opts.authHeader !== undefined ? `${opts.authHeader} ` : undefined),
    };
}
/** Build a chat-completions body in the classic or the newer (compat) dialect. */
function buildBody(req: any, compat: boolean, opts: StreamOptions, includeReasoning = true) {
    const messages = [];
    if (req.system)
        messages.push({ role: "system", content: req.system });
    for (const m of req.messages) {
        if (m.role === "tool") {
            messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
            continue;
        }
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
            messages.push({
                role: "assistant",
                content: m.content || null,
                tool_calls: m.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: { name: call.name, arguments: call.arguments },
                })),
            });
            continue;
        }
        messages.push({ role: m.role, content: m.content });
    }
    const body: any = { model: req.model, messages, stream: true };
    if (req.tools && req.tools.length > 0) {
        body.tools = req.tools;
        body.tool_choice = "auto";
    }
    if (req.maxOutputTokens !== undefined) {
        if (compat)
            body.max_completion_tokens = req.maxOutputTokens;
        else
            body.max_tokens = req.maxOutputTokens;
    }
    if (req.temperature !== undefined && !compat)
        body.temperature = req.temperature;
    if (includeReasoning && req.reasoningEffort && req.reasoningEffort !== "auto") {
        const effort = req.reasoningEffort === "max" ? "high" : req.reasoningEffort;
        if (opts.reasoning === "openai")
            body.reasoning_effort = effort;
        else if (opts.reasoning === "openrouter")
            body.reasoning = { effort };
    }
    return body;
}
export async function* streamChatCompletion(req: any, opts: StreamOptions) {
    const hasReasoning = Boolean(req.reasoningEffort && req.reasoningEffort !== "auto" && opts.reasoning && opts.reasoning !== "none");
    const spec = toRequestSpec(opts);
    const send = async (compat, includeReasoning = hasReasoning) => {
        const headers: Record<string, string> = {
            "content-type": "application/json",
            accept: "text/event-stream",
            ...(opts.extraHeaders ?? {}),
        };
        if (opts.apiKey)
            Object.assign(headers, buildHeaders(spec, opts.apiKey));
        if (req.clientRequestId)
            headers["idempotency-key"] = req.clientRequestId;
        return await fetch(buildRequestUrl(spec, opts.chatPath ?? "/chat/completions"), {
            method: "POST",
            headers,
            body: JSON.stringify(buildBody(req, compat, opts, includeReasoning)),
            signal: req.signal,
        });
    };
    let res = await send(false);
    if (!res.ok) {
        let detail = await res.text().catch(() => "");
        // At most ONE 400 retry per clientRequestId. Either the model rejects
        // the thinking parameter, or it rejects the legacy OpenAI parameters;
        // never chain both (that used to turn one bad turn into 3 HTTP calls).
        const retryReasoning = res.status === 400 && hasReasoning
            && /reasoning|thinking|effort|unsupported|unrecognized|unknown parameter/i.test(detail);
        const retryCompat = !retryReasoning && res.status === 400
            && /max_tokens|max_completion_tokens|temperature|unsupported|unrecognized|unknown parameter/i.test(detail);
        if (retryReasoning || retryCompat) {
            res = await send(retryCompat, false);
            detail = res.ok ? detail : await res.text().catch(() => "");
        }
        if (!res.ok) {
            const prefix = `${res.status} ${res.statusText}`;
            const body = detail.startsWith(`${prefix}:`) ? detail.slice(prefix.length + 1).trimStart() : detail;
            throw new Error(`${prefix}: ${body.slice(0, 500)}`);
        }
    }
    // Some gateways ignore `stream: true` and return one complete JSON body.
    // Map that shape directly; feeding it to the SSE parser yields nothing.
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("application/json") && !contentType.includes("event-stream")) {
        const bodyText = await res.text();
        let payload: any;
        try {
            payload = JSON.parse(bodyText);
        }
        catch {
            throw new Error("Non-stream response was not valid JSON: " + bodyText.slice(0, 200));
        }
        const choice = payload?.choices?.[0];
        const message = choice?.message ?? choice?.delta ?? {};
        const content = typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content)
                ? message.content.map((part: any) => part?.text ?? "").join("")
                : "";
        // A non-streaming JSON body is structured: `content` is plain text and
        // must not be rescanned for `<fastcode_tool>` / dialect markup. Only
        // `message.tool_calls` becomes a tool call.
        if (content)
            yield { delta: content, done: false, suppressPseudoParse: true };
        const completeCalls: NativeToolCall[] = Array.isArray(message.tool_calls)
            ? message.tool_calls
                .map((call: any, index: number) => {
                const args = call?.function?.arguments;
                return {
                    id: call?.id || `call_${index}`,
                    name: call?.function?.name,
                    arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
                };
            })
                .filter((call: NativeToolCall) => Boolean(call.name))
            : [];
        const parsedUsage = payload?.usage
            ? {
                inputTokens: payload.usage.prompt_tokens,
                outputTokens: payload.usage.completion_tokens,
                totalTokens: payload.usage.total_tokens,
            }
            : undefined;
        yield {
            delta: "",
            done: true,
            suppressPseudoParse: true,
            ...(parsedUsage ? { usage: parsedUsage } : {}),
            ...(completeCalls.length > 0 ? { toolCalls: completeCalls } : {}),
        };
        return;
    }
    let usage;
    const toolCalls: ToolCallAccumulator = new Map();
    for await (const ev of streamSSE(res, { idleTimeoutMs: req.idleTimeoutMs })) {
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
        if (Array.isArray(choice?.delta?.tool_calls)) {
            for (const delta of choice.delta.tool_calls)
                mergeToolCallDelta(toolCalls, delta);
        }
        if (Array.isArray(choice?.message?.tool_calls)) {
            for (const delta of choice.message.tool_calls)
                mergeToolCallDelta(toolCalls, delta);
        }
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
    const calls = finalizeToolCalls(toolCalls);
    yield calls.length > 0 ? { delta: "", done: true, usage, toolCalls: calls } : { delta: "", done: true, usage };
}
export async function listModelsHttp(opts: StreamOptions) {
    const staticModels = opts.staticModels ?? [];
    if (opts.modelsPath === null)
        return staticModels;
    if (!opts.apiKey && staticModels.length)
        return staticModels;
    try {
        const spec = toRequestSpec(opts);
        const headers = opts.apiKey ? buildHeaders(spec, opts.apiKey) : {};
        const json = await fetchJson(buildRequestUrl(spec, opts.modelsPath ?? "/models"), { headers });
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
