import type { ChatChunk } from "../types.js";
export declare class QuotaError extends Error {
    readonly code = "QUOTA";
    constructor(message: string);
}
export declare class IncompleteStreamError extends Error {
    readonly partialText: string;
    constructor(message: string, partialText: string);
}
export interface RetryRequestOptions {
    retries?: number;
    backoffMs?: number[];
    retryOn?: (error: Error) => boolean;
    signal?: AbortSignal;
}
export interface RetryStreamOptions {
    clientRequestId?: string;
    lastAcc?: string;
    retries?: number;
    backoffMs?: number[];
    retryOn?: (error: Error) => boolean;
    signal?: AbortSignal;
    onRetry?: (error: Error, attempt: number) => void;
    onReset?: () => void;
}
export interface StreamChunk extends ChatChunk {
    reset?: boolean;
}
export declare function isRetryableError(error: Error): boolean;
export declare function retryRequest<T>(fn: (attempt: number) => Promise<T>, options?: RetryRequestOptions): Promise<T>;
export declare function retryStream(send: (options: {
    clientRequestId: string;
}) => AsyncGenerator<ChatChunk>, options?: RetryStreamOptions): AsyncGenerator<StreamChunk>;
