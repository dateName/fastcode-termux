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
