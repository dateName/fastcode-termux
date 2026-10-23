import { IncompleteStreamError, retryStream } from "../lib/net.js";
export async function runStream(provider, req, apiKey, options = {}) {
    const idleTimeoutMs = positive(options.idleTimeoutMs, 60_000);
    const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 1));
    let retried = 0;
    let text = "";
    let usage;
    let toolCalls;
    let sawDone = false;
    const send = async function* ({ clientRequestId }) {
        yield* attemptChunks(provider, { ...req, clientRequestId }, apiKey, {
            signal: options.signal,
            idleTimeoutMs,
        });
    };
    try {
        for await (const chunk of retryStream(send, {
            clientRequestId: options.clientRequestId,
            retries: maxRetries,
            signal: options.signal,
            backoffMs: options.retryBackoffMs,
            onRetry: () => {
                retried += 1;
            },
            onReset: options.onReset,
        })) {
            if (chunk.reset)
                text = chunk.delta ?? "";
            else if (chunk.delta)
                text += chunk.delta;
            if (chunk.delta)
                options.onDelta?.(chunk.delta, text);
            if (chunk.usage)
                usage = chunk.usage;
            if (chunk.toolCalls)
                toolCalls = chunk.toolCalls;
            if (chunk.done)
                sawDone = true;
        }
    }
    catch (err) {
        if (err instanceof IncompleteStreamError) {
            return { text: err.partialText || text, usage, toolCalls, incomplete: true, retried };
        }
        if (err && typeof err === "object" && !err.partialText && text)
            err.partialText = text;
        throw err;
    }
    return { text, usage, toolCalls, incomplete: !sawDone, retried };
}
async function* attemptChunks(provider, req, apiKey, options) {
    const parent = options.signal;
    const child = new AbortController();
    let timedOut = false;
    const forwardAbort = () => child.abort();
    if (parent) {
        if (parent.aborted)
            child.abort();
        else
            parent.addEventListener("abort", forwardAbort, { once: true });
    }
    let timer;
    const resetIdle = () => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => {
            timedOut = true;
            child.abort();
        }, options.idleTimeoutMs);
    };
    resetIdle();
    try {
        for await (const chunk of provider.stream({ ...req, signal: child.signal }, apiKey)) {
            resetIdle();
            yield chunk;
            if (chunk.done)
                return;
        }
    }
    catch (err) {
        if (parent?.aborted)
            throw abortError();
        if (timedOut)
            throw new Error(`stream idle timeout after ${options.idleTimeoutMs}ms (no data received)`);
        throw toError(err);
    }
    finally {
        if (timer)
            clearTimeout(timer);
        parent?.removeEventListener("abort", forwardAbort);
    }
}
function abortError() {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
function positive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
