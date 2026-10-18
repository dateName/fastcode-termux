/**
 * Streaming request runner with an idle timeout and one safe retry.
 *
 * `provider.stream()` only exposes the caller's AbortSignal, so a connection
 * that stalls after the headers arrive can wait forever. This wrapper adds:
 *   • an idle timer reset on every chunk (default 60s),
 *   • a retry when the attempt failed before producing any text
 *     (retrying after partial output would duplicate tokens),
 *   • `incomplete` detection so the chat loop can tell "server closed early"
 *     from a normal finish.
 */
import type { ChatChunk, ChatRequest, Provider } from "../types.js";
export interface RunStreamOptions {
    signal?: AbortSignal;
    idleTimeoutMs?: number;
    maxRetries?: number;
    onDelta?: (delta: string, text: string) => void;
}
export interface RunStreamResult {
    text: string;
    usage?: ChatChunk["usage"];
    /** True when the stream ended without a done chunk. */
    incomplete: boolean;
    retried: number;
}
export declare function runStream(provider: Provider, req: ChatRequest, apiKey: string | undefined, options?: RunStreamOptions): Promise<RunStreamResult>;
