/**
 * Streaming request runner with an idle timeout and prefix-safe retry.
 *
 * `provider.stream()` only exposes the caller's AbortSignal, so a connection
 * that stalls after the headers arrive can wait forever. This wrapper adds:
 *   • an idle timer reset on every chunk (default 60s),
 *   • retries routed through `retryStream`, which skips the already delivered
 *     prefix instead of duplicating tokens,
 *   • `incomplete` detection so the chat loop can tell "server closed early"
 *     from a normal finish.
 */
import type { ChatChunk, ChatRequest, Provider } from "../types.js";
import { IncompleteStreamError, retryStream } from "../lib/net.js";
import { chunkToStreamEvents, StreamAssembler } from "./stream-events.js";

export interface RunStreamOptions {
    signal?: AbortSignal;
    idleTimeoutMs?: number;
    maxRetries?: number;
    onDelta?: (delta: string, text: string) => void;
    onReset?: () => void;
    clientRequestId?: string;
    retryBackoffMs?: number[];
}

export interface RunStreamResult {
    text: string;
    /** Thinking/reasoning text, kept separate from the visible answer. */
    reasoning?: string;
    usage?: ChatChunk["usage"];
    toolCalls?: ChatChunk["toolCalls"];
    suppressPseudoParse?: boolean;
    warnings?: string[];
    incomplete: boolean;
    retried: number;
}

export async function runStream(provider: Provider, req: ChatRequest, apiKey: string | undefined, options: RunStreamOptions = {}): Promise<RunStreamResult> {
    const idleTimeoutMs = positive(options.idleTimeoutMs, 60_000);
    // A non-idempotent backend (for example a CLI that resumes a session or
    // performs work per spawn) must not replay the turn on a transient error.
    const maxRetries = provider.capabilities?.retryable === false
        ? 0
        : Math.max(0, Math.floor(options.maxRetries ?? 1));
    let retried = 0;
    const assembler = new StreamAssembler();
    let sawDone = false;
    let suppressPseudoParse = false;
    const send = async function* ({ clientRequestId }: { clientRequestId: string }) {
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
            if (chunk.suppressPseudoParse)
                suppressPseudoParse = true;
            // After turn-end nothing may reach onDelta; a malformed provider
            // that appends records after done must not extend the answer.
            if (!assembler.ended) {
                for (const event of chunkToStreamEvents(chunk))
                    assembler.push(event);
                if (chunk.delta)
                    options.onDelta?.(chunk.delta, assembler.text);
            }
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
                suppressPseudoParse: suppressPseudoParse || undefined,
                warnings: assembler.warnings.length > 0 ? assembler.warnings : undefined,
                incomplete: true,
                retried,
            };
        }
        if (err && typeof err === "object" && !(err as { partialText?: string }).partialText && partial)
            (err as { partialText?: string }).partialText = partial;
        throw err;
    }
    const assembled = assembler.snapshot();
    return {
        text: assembled.text,
        reasoning: assembled.thinking || undefined,
        usage: assembled.usage,
        toolCalls: assembled.toolCalls.length > 0 ? assembled.toolCalls : undefined,
        suppressPseudoParse: suppressPseudoParse || undefined,
        warnings: assembled.warnings.length > 0 ? assembled.warnings : undefined,
        incomplete: !sawDone,
        retried,
    };
}

interface AttemptOptions {
    signal?: AbortSignal;
    idleTimeoutMs: number;
}

async function* attemptChunks(provider: Provider, req: ChatRequest, apiKey: string | undefined, options: AttemptOptions): AsyncGenerator<ChatChunk> {
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
    let timer: ReturnType<typeof setTimeout> | undefined;
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

function abortError(): Error {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

function positive(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
