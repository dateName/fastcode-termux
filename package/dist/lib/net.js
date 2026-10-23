import { randomUUID } from "node:crypto";
export class QuotaError extends Error {
    code = "QUOTA";
    constructor(message) {
        super(message);
        this.name = "QuotaError";
    }
}
export class IncompleteStreamError extends Error {
    partialText;
    constructor(message, partialText) {
        super(message);
        this.name = "IncompleteStreamError";
        this.partialText = partialText;
    }
}
const DEFAULT_BACKOFF = [1000, 2000, 4000];
const STREAM_BACKOFF = [400, 800, 1600];
export function isRetryableError(error) {
    const message = String(error?.message ?? error);
    if (/\b(401|402|403|404)\b/.test(message))
        return false;
    if (/timeout|timed? ?out|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE|fetch failed|network|socket hang up|terminated|other side closed|stream ended before done/i.test(message))
        return true;
    return /\b(429|5\d\d)\b/.test(message);
}
function isQuotaError(error) {
    return /\b429\b|quota|insufficient|rate limit|billing|balance/i.test(String(error?.message ?? error));
}
export async function retryRequest(fn, options = {}) {
    const attempts = Math.max(1, Math.floor(options.retries ?? 3));
    const backoff = options.backoffMs ?? DEFAULT_BACKOFF;
    const retryOn = options.retryOn ?? isRetryableError;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (options.signal?.aborted)
            throw abortError();
        try {
            return await fn(attempt);
        }
        catch (err) {
            lastError = toError(err);
            if (attempt >= attempts - 1 || !retryOn(lastError))
                break;
            await delay(backoff[Math.min(attempt, backoff.length - 1)], options.signal);
        }
    }
    if (lastError && isQuotaError(lastError))
        throw new QuotaError(lastError.message);
    throw lastError ?? new Error("retryRequest failed");
}
export async function* retryStream(send, options = {}) {
    const clientRequestId = options.clientRequestId ?? randomUUID();
    const attempts = Math.max(1, Math.floor(options.retries ?? 1) + 1);
    const backoff = options.backoffMs ?? STREAM_BACKOFF;
    const retryOn = options.retryOn ?? isRetryableError;
    let delivered = options.lastAcc ?? "";
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (options.signal?.aborted)
            throw abortError();
        let buffering = delivered.length > 0;
        let pending = "";
        let doneSeen = false;
        let usage;
        let toolCalls;
        try {
            for await (const chunk of send({ clientRequestId })) {
                if (options.signal?.aborted)
                    throw abortError();
                if (chunk.usage)
                    usage = chunk.usage;
                if (chunk.toolCalls)
                    toolCalls = chunk.toolCalls;
                const delta = chunk.delta ?? "";
                if (!delta) {
                    if (!buffering && !chunk.done)
                        yield chunk;
                    if (chunk.done)
                        doneSeen = true;
                    continue;
                }
                if (buffering) {
                    pending += delta;
                    const matchedPrefix = delivered.startsWith(pending) || pending.startsWith(delivered);
                    if (delivered.startsWith(pending)) {
                        if (pending.length === delivered.length) {
                            buffering = false;
                            pending = "";
                        }
                        if (chunk.done)
                            doneSeen = true;
                        continue;
                    }
                    if (matchedPrefix) {
                        const extra = pending.slice(delivered.length);
                        buffering = false;
                        pending = "";
                        if (extra) {
                            delivered += extra;
                            yield { ...chunk, delta: extra, done: false };
                        }
                    }
                    else {
                        buffering = false;
                        delivered = pending;
                        pending = "";
                        options.onReset?.();
                        yield { ...chunk, delta: delivered, reset: true, done: false };
                    }
                    if (chunk.done)
                        doneSeen = true;
                    continue;
                }
                delivered += delta;
                yield { ...chunk, done: false };
                if (chunk.done)
                    doneSeen = true;
            }
            if (!doneSeen)
                throw new IncompleteStreamError("stream ended before done", delivered);
            yield {
                delta: "",
                done: true,
                ...(usage ? { usage } : {}),
                ...(toolCalls ? { toolCalls } : {}),
            };
            return;
        }
        catch (err) {
            lastError = toError(err);
            if (options.signal?.aborted)
                throw abortError();
            if (attempt >= attempts - 1 || !retryOn(lastError)) {
                lastError.partialText = delivered;
                throw lastError;
            }
            options.onRetry?.(lastError, attempt + 1);
            await delay(backoff[Math.min(attempt, backoff.length - 1)], options.signal);
        }
    }
    throw lastError ?? new Error("retryStream failed");
}
function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
function abortError() {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
