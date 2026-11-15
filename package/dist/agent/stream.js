import { IncompleteStreamError, retryStream } from "../lib/net.js";
import { chunkToStreamEvents, StreamAssembler } from "./stream-events.js";
export async function runStream(provider, req, apiKey, options = {}) {
    const idleTimeoutMs = positive(options.idleTimeoutMs, 60_000);
    // A non-idempotent backend (for example a CLI that resumes a session or
    // performs work per spawn) must not replay the turn on a transient error.
    const maxRetries = provider.capabilities?.retryable === false
        ? 0
        : Math.max(0, Math.floor(options.maxRetries ?? 1));
    let retried = 0;
    const assembler = new StreamAssembler();
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
            // Prefix-safe retry replaces the whole stream; clear the assembly
            // state before applying the replacement chunk.
            if (chunk.reset)
                assembler.reset();
            for (const event of chunkToStreamEvents(chunk))
                assembler.push(event);
            if (chunk.delta)
                options.onDelta?.(chunk.delta, assembler.text);
            if (chunk.done)
                sawDone = true;
        }
    }
    catch (err) {
        const partial = assembler.text;
        const calls = assembler.toolCalls();
        if (err instanceof IncompleteStreamError) {
            return {
                text: partial || err.partialText,
                reasoning: assembler.thinking || undefined,
                usage: assembler.usage,
                toolCalls: calls.length > 0 ? calls : undefined,
                incomplete: true,
                retried,
            };
        }
        if (err && typeof err === "object" && !err.partialText && partial)
            err.partialText = partial;
        throw err;
    }
    const assembled = assembler.snapshot();
    return {
        text: assembled.text,
        reasoning: assembled.thinking || undefined,
        usage: assembled.usage,
        toolCalls: assembled.toolCalls.length > 0 ? assembled.toolCalls : undefined,
        incomplete: !sawDone,
        retried,
    };
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
        for await (const chunk of provider.stream({ ...req, signal: child.signal, idleTimeoutMs: options.idleTimeoutMs }, apiKey)) {
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
