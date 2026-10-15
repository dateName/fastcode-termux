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
/** Async iterator over SSE events from a streaming HTTP response. */
export async function* streamSSE(res) {
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    }
    if (!res.body)
        throw new Error("Empty response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        // Normalize CR/LF so both "\n\n" and "\r\n\r\n" frame separators
        // are detected, including a CR/LF split across two chunks.
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n?/g, "\n");
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const ev = parseSseChunk(chunk);
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
