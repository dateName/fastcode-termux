import { assertNever } from "../lib/values.js";
/**
 * Incremental chunk-to-response assembler.
 *
 * Tolerant of delta-only protocols (no block-start/end): deltas create their
 * slot on first sight. A completed `tool-call-end` freezes that slot so a
 * misbehaving provider cannot append to a closed call.
 */
export class StreamAssembler {
    textParts = [];
    thinkingParts = [];
    partials = new Map();
    completed = new Map();
    _usage;
    _finish;
    _ended = false;
    /** Drop all accumulated content (prefix-safe retry replaced the stream). */
    reset() {
        this.textParts = [];
        this.thinkingParts = [];
        this.partials.clear();
        this.completed.clear();
        this._usage = undefined;
        this._finish = undefined;
        this._ended = false;
    }
    push(event) {
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
            case "usage":
                this._usage = event.usage;
                return;
            case "turn-end":
                this._finish = event.reason;
                this._ended = true;
                return;
            default:
                return assertNever(event, "StreamAssembler.push");
        }
    }
    get text() {
        return this.textParts.join("");
    }
    get thinking() {
        return this.thinkingParts.join("");
    }
    get ended() {
        return this._ended;
    }
    get usage() {
        return this._usage;
    }
    /**
     * Complete tool calls in stream order. A partial call without a
     * `tool-call-end` is completed from its deltas only when it has a name;
     * otherwise it is dropped rather than executed with an empty tool name.
     */
    toolCalls() {
        const calls = new Map(this.completed);
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
    snapshot() {
        return {
            text: this.text,
            thinking: this.thinking,
            toolCalls: this.toolCalls(),
            usage: this._usage,
            finish: this._finish,
        };
    }
}
/** Translate one legacy `ChatChunk` into canonical events. */
export function chunkToStreamEvents(chunk) {
    const events = [];
    if (chunk.reasoning)
        events.push({ type: "thinking-delta", text: chunk.reasoning });
    if (chunk.delta)
        events.push({ type: "text-delta", text: chunk.delta });
    if (chunk.usage)
        events.push({ type: "usage", usage: chunk.usage });
    if (chunk.done && chunk.toolCalls) {
        chunk.toolCalls.forEach((call, index) => events.push({ type: "tool-call-end", index, call }));
    }
    if (chunk.done) {
        events.push({
            type: "turn-end",
            reason: chunk.toolCalls && chunk.toolCalls.length > 0 ? "tool-calls" : "stop",
        });
    }
    return events;
}
