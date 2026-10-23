/**
 * Tiny fetch helpers. We standardize on globalThis.fetch (Node 18+).
 *
 * The `streamSSE` helper parses Server-Sent Events for any provider that uses
 * the OpenAI-style `data: {...}\n\n` chunk format. Non-SSE providers (e.g.
 * Anthropic's older streaming) handle their own parsing.
 */
export declare function fetchJson(url: string, init?: any): Promise<any>;
export declare class NetworkStallError extends Error {
    readonly code = "NETWORK_STALL";
    readonly bytesReceived: number;
    constructor(message: string, bytesReceived?: number);
}
export interface StreamSseOptions {
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
}
/** Async iterator over SSE events from a streaming HTTP response. */
export declare function streamSSE(res: any, options?: StreamSseOptions): AsyncGenerator<{
    event: any;
    data: string;
}, void, unknown>;
export declare function probeConnectivity(url: string, timeoutMs?: number): Promise<boolean>;
