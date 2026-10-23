/**
 * Tiny fetch helpers. We standardize on globalThis.fetch (Node 18+).
 *
 * The `streamSSE` helper parses Server-Sent Events for any provider that uses
 * the OpenAI-style `data: {...}\n\n` chunk format. Non-SSE providers (e.g.
 * Anthropic's older streaming) handle their own parsing.
 */
export async function fetchJson(url: string, init: any = {}): Promise<any> {
    const res = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", accept: "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    }
    return (await res.json());
}
export class NetworkStallError extends Error {
    readonly code = "NETWORK_STALL";
    readonly bytesReceived: number;
    constructor(message: string, bytesReceived = 0) {
        super(message);
        this.name = "NetworkStallError";
        this.bytesReceived = bytesReceived;
    }
}
export interface StreamSseOptions {
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
}
/** Async iterator over SSE events from a streaming HTTP response. */
export async function* streamSSE(res, options: StreamSseOptions = {}) {
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    }
    if (!res.body)
        throw new Error("Empty response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const envIdle = Number(process.env["FASTCODE_SSE_IDLE_MS"]);
    const idleMs = positive(options.idleTimeoutMs, positive(envIdle, 25_000));
    const totalMs = positive(options.totalTimeoutMs, 0);
    const startedAt = Date.now();
    let bytesReceived = 0;
    let buffer = "";
    while (true) {
        const remaining = totalMs > 0 ? totalMs - (Date.now() - startedAt) : Number.POSITIVE_INFINITY;
        if (remaining <= 0)
            throw new NetworkStallError(`SSE total timeout after ${totalMs}ms`, bytesReceived);
        const boundedByTotal = remaining <= idleMs;
        const waitMs = boundedByTotal ? Math.max(1, remaining) : idleMs;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new NetworkStallError(boundedByTotal
                    ? `SSE total timeout after ${totalMs}ms`
                    : `SSE idle timeout after ${idleMs}ms (no data received; set FASTCODE_SSE_IDLE_MS to wait longer)`, bytesReceived));
            }, waitMs);
        });
        let chunk;
        try {
            chunk = await Promise.race([reader.read(), timeout]);
        }
        catch (err) {
            await reader.cancel().catch(() => undefined);
            throw err;
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
        const { value, done } = chunk;
        if (done)
            break;
        bytesReceived += value?.byteLength ?? 0;
        // Normalize CR/LF so both "\n\n" and "\r\n\r\n" frame separators
        // are detected, including a CR/LF split across two chunks.
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n?/g, "\n");
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
            const chunkText = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const ev = parseSseChunk(chunkText);
            if (ev)
                yield ev;
            sep = buffer.indexOf("\n\n");
        }
    }
    // Flush trailing event without final \n\n (some servers do this).
    const trailing = buffer.trim();
    if (trailing) {
        const ev = parseSseChunk(trailing);
        if (ev)
            yield ev;
    }
}
export async function probeConnectivity(url: string, timeoutMs = 3000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), positive(timeoutMs, 3000));
    try {
        const res = await fetch(url, { signal: controller.signal });
        await res.body?.cancel().catch(() => undefined);
        return res.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
function positive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function parseSseChunk(chunk) {
    let event;
    const dataLines = [];
    for (const lineRaw of chunk.split("\n")) {
        const line = lineRaw.replace(/\r$/, "");
        if (!line || line.startsWith(":"))
            continue;
        if (line.startsWith("event:"))
            event = line.slice(6).trim();
        else if (line.startsWith("data:"))
            dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0)
        return undefined;
    return { event, data: dataLines.join("\n") };
}
