/**
 * Provider-neutral streaming vocabulary and the single assembly algorithm.
 *
 * Providers translate their wire format (HTTP/SSE, NDJSON, JSON-RPC, …) into
 * `StreamEvent`s. This module is the only place that folds deltas into a final
 * response, so every backend produces the same text/thinking/tool-call/usage
 * shape and consumers never re-implement the folding.
 *
 * Invariants (mirrored from the reference event contracts):
 * - usage arrives before `turn-end`; records after `turn-end` are ignored;
 * - tool calls are complete only at `turn-end` (delta streams may still grow);
 * - an interrupted stream keeps text/thinking but never keeps an incomplete
 *   tool call (a call without a result must not be executed).
 */
import type { ChatChunk, NativeToolCall } from "../types.js";
export type TurnEndReason = "stop" | "tool-calls" | "max-tokens" | "aborted" | "error";
export type StreamEvent = {
    type: "block-start";
    index?: number;
    blockType: "text" | "thinking" | "tool-call";
} | {
    type: "text-delta";
    index?: number;
    text: string;
} | {
    type: "thinking-delta";
    index?: number;
    text: string;
} | {
    type: "tool-call-delta";
    index: number;
    id: string;
    name?: string;
    argumentsDelta: string;
} | {
    type: "tool-call-end";
    index: number;
    call: NativeToolCall;
} | {
    type: "usage";
    usage: NonNullable<ChatChunk["usage"]>;
} | {
    type: "turn-end";
    reason: TurnEndReason;
};
export interface AssembledStream {
    text: string;
    thinking: string;
    toolCalls: NativeToolCall[];
    usage?: ChatChunk["usage"];
    finish?: TurnEndReason;
}
/**
 * Incremental chunk-to-response assembler.
 *
 * Tolerant of delta-only protocols (no block-start/end): deltas create their
 * slot on first sight. A completed `tool-call-end` freezes that slot so a
 * misbehaving provider cannot append to a closed call.
 */
export declare class StreamAssembler {
    private textParts;
    private thinkingParts;
    private partials;
    private completed;
    private _usage;
    private _finish;
    private _ended;
    /** Drop all accumulated content (prefix-safe retry replaced the stream). */
    reset(): void;
    push(event: StreamEvent): void;
    get text(): string;
    get thinking(): string;
    get ended(): boolean;
    get usage(): ChatChunk["usage"];
    /**
     * Complete tool calls in stream order. A partial call without a
     * `tool-call-end` is completed from its deltas only when it has a name;
     * otherwise it is dropped rather than executed with an empty tool name.
     */
    toolCalls(): NativeToolCall[];
    snapshot(): AssembledStream;
}
/** Translate one legacy `ChatChunk` into canonical events. */
export declare function chunkToStreamEvents(chunk: ChatChunk): StreamEvent[];
