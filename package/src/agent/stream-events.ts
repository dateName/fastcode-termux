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
import { assertNever } from "../lib/values.js";

export type TurnEndReason = "stop" | "tool-calls" | "max-tokens" | "aborted" | "error";

export type StreamEvent =
    | { type: "block-start"; index?: number; blockType: "text" | "thinking" | "tool-call" }
    | { type: "text-delta"; index?: number; text: string }
    | { type: "thinking-delta"; index?: number; text: string }
    | { type: "tool-call-delta"; index: number; id: string; name?: string; argumentsDelta: string }
    | { type: "tool-call-end"; index: number; call: NativeToolCall }
    | { type: "usage"; usage: NonNullable<ChatChunk["usage"]> }
    | { type: "turn-end"; reason: TurnEndReason };

export interface AssembledStream {
    text: string;
    thinking: string;
    toolCalls: NativeToolCall[];
    usage?: ChatChunk["usage"];
    finish?: TurnEndReason;
    /** Non-fatal provider anomalies (duplicate/divergent usage, …). */
    warnings: string[];
}

interface PartialToolCall {
    id: string;
    name: string;
    arguments: string;
}

/**
 * Incremental chunk-to-response assembler.
 *
 * Tolerant of delta-only protocols (no block-start/end): deltas create their
 * slot on first sight. A completed `tool-call-end` freezes that slot so a
 * misbehaving provider cannot append to a closed call.
 */
export class StreamAssembler {
    private textParts: string[] = [];
    private thinkingParts: string[] = [];
    private partials = new Map<number, PartialToolCall>();
    private completed = new Map<number, NativeToolCall>();
    private _usage: ChatChunk["usage"];
    private _finish: TurnEndReason | undefined;
    private _ended = false;
    private _warnings: string[] = [];

    /** Drop all accumulated content (prefix-safe retry replaced the stream). */
    reset(): void {
        this.textParts = [];
        this.thinkingParts = [];
        this.partials.clear();
        this.completed.clear();
        this._usage = undefined;
        this._finish = undefined;
        this._ended = false;
        this._warnings = [];
    }

    push(event: StreamEvent): void {
        // Malformed providers sometimes emit trailing records; the last
        // turn-end wins no more information, so ignore them instead of
        // corrupting an already-final response.
        if (this._ended)
            return;
        switch (event.type) {
            case "block-start":
                return;
            case "text-delta":
                this.textParts.push(event.text);
                return;
            case "thinking-delta":
                this.thinkingParts.push(event.text);
                return;
            case "tool-call-delta": {
                const index = event.index;
                const partial = this.partials.get(index) ?? { id: event.id, name: "", arguments: "" };
                if (event.id)
                    partial.id = event.id;
                if (event.name)
                    partial.name = event.name;
                partial.arguments += event.argumentsDelta;
                this.partials.set(index, partial);
                return;
            }
            case "tool-call-end":
                this.completed.set(event.index, event.call);
                this.partials.delete(event.index);
                return;
            case "usage": {
                // Some gateways send usage twice (stream frame + final frame).
                // Keep the latest values but surface the duplicate instead of
                // silently overwriting the first report.
                if (this._usage && !this._warnings.includes("Stream reported usage more than once; the latest values were kept."))
                    this._warnings.push("Stream reported usage more than once; the latest values were kept.");
                this._usage = event.usage;
                return;
            }
            case "turn-end":
                this._finish = event.reason;
                this._ended = true;
                return;
            default:
                return assertNever(event, "StreamAssembler.push");
        }
    }

    get text(): string {
        return this.textParts.join("");
    }

    get thinking(): string {
        return this.thinkingParts.join("");
    }

    get ended(): boolean {
        return this._ended;
    }

    get usage(): ChatChunk["usage"] {
        return this._usage;
    }

    get warnings(): string[] {
        return [...this._warnings];
    }

    /**
     * Complete tool calls in stream order. A partial call without a
     * `tool-call-end` is completed from its deltas only when it has a name;
     * otherwise it is dropped rather than executed with an empty tool name.
     */
    toolCalls(): NativeToolCall[] {
        const calls = new Map<number, NativeToolCall>(this.completed);
        for (const [index, partial] of this.partials) {
            if (calls.has(index))
                continue;
            if (!partial.name)
                continue;
            calls.set(index, {
                id: partial.id || `call_${index}`,
                name: partial.name,
                arguments: partial.arguments || "{}",
            });
        }
        return Array.from(calls.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, call]) => call);
    }

    snapshot(): AssembledStream {
        return {
            text: this.text,
            thinking: this.thinking,
            toolCalls: this.toolCalls(),
            usage: this._usage,
            finish: this._finish,
            warnings: [...this._warnings],
        };
    }
}

/** Translate one legacy `ChatChunk` into canonical events. */
export function chunkToStreamEvents(chunk: ChatChunk): StreamEvent[] {
    const events: StreamEvent[] = [];
    if (chunk.reasoning)
        events.push({ type: "thinking-delta", text: chunk.reasoning });
    if (chunk.delta)
        events.push({ type: "text-delta", text: chunk.delta });
    if (chunk.usage)
        events.push({ type: "usage", usage: chunk.usage });
    if (chunk.done && chunk.toolCalls) {
        chunk.toolCalls.forEach((call, index) => events.push({ type: "tool-call-end", index, call }));
    }
    else if (chunk.toolCalls) {
        // A complete call on a non-final chunk must not be lost: fold it into
        // the accumulator and let the turn-end freeze it, like deltas.
        chunk.toolCalls.forEach((call, index) => events.push({
            type: "tool-call-delta",
            index,
            id: call.id,
            name: call.name,
            argumentsDelta: call.arguments,
        }));
    }
    if (chunk.done) {
        events.push({
            type: "turn-end",
            reason: chunk.toolCalls && chunk.toolCalls.length > 0 ? "tool-calls" : "stop",
        });
    }
    return events;
}
