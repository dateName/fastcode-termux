export async function runStream(provider, req, apiKey, options = {}) {
    const idleTimeoutMs = positive(options.idleTimeoutMs, 60_000);
    const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 1));
    let attempt = 0;
    let retried = 0;
    for (;;) {
        const result = await attemptStream(provider, req, apiKey, { ...options, idleTimeoutMs });
        if (!result.error)
            return { ...result, retried };
        if (options.signal?.aborted)
            throw abortError();
        const canRetry = result.text.length === 0 && retried < maxRetries && isRetryable(result.error);
        if (!canRetry)
            throw result.error;
        retried += 1;
        attempt += 1;
        await delay(400 * attempt, options.signal);
    }
}
async function attemptStream(provider, req, apiKey, options) {
    const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
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
        }, idleTimeoutMs);
    };
    resetIdle();
    let text = "";
    let usage;
    let finished = false;
    try {
        for await (const chunk of provider.stream({ ...req, signal: child.signal }, apiKey)) {
            resetIdle();
            if (chunk.delta) {
                text += chunk.delta;
                options.onDelta?.(chunk.delta, text);
            }
            if (chunk.usage)
                usage = chunk.usage;
            if (chunk.done) {
                finished = true;
                break;
            }
        }
    }
    catch (err) {
        if (parent?.aborted)
            throw abortError();
        const error = timedOut
            ? new Error(`stream idle timeout after ${idleTimeoutMs}ms (no data received)`)
            : toError(err);
        return { text, usage, incomplete: true, retried: 0, error };
    }
    finally {
        if (timer)
            clearTimeout(timer);
        parent?.removeEventListener("abort", forwardAbort);
    }
    return { text, usage, incomplete: !finished, retried: 0 };
}
function isRetryable(error) {
    const message = String(error?.message ?? error);
    if (/\b(401|402|403|404)\b/.test(message))
        return false;
    if (/timeout|timed? ?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|network|socket hang up|terminated|other side closed/i.test(message))
        return true;
    return /\b5\d\d\b/.test(message);
}
function abortError() {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
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
function positive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
