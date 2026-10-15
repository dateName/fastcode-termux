/**
 * Tiny fetch helpers. We standardize on globalThis.fetch (Node 18+).
 *
 * The `streamSSE` helper parses Server-Sent Events for any provider that uses
 * the OpenAI-style `data: {...}\n\n` chunk format. Non-SSE providers (e.g.
 * Anthropic's older streaming) handle their own parsing.
 */
export declare function fetchJson(url: string, init?: any): Promise<any>;
/** Async iterator over SSE events from a streaming HTTP response. */
export declare function streamSSE(res: any): AsyncGenerator<{
    event: any;
    data: string;
}, void, unknown>;
