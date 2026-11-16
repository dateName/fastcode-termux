import type { NativeToolCall } from "../types.js";

export type ToolCallAccumulator = Map<number, NativeToolCall>;

export interface ToolCallDelta {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
}

export function mergeToolCallDelta(accumulator: ToolCallAccumulator, delta: ToolCallDelta): void {
    const index = resolveIndex(accumulator, delta);
    const entry = accumulator.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof delta.id === "string" && delta.id)
        entry.id = delta.id;
    if (typeof delta.function?.name === "string" && delta.function.name)
        entry.name = delta.function.name;
    const args = delta.function?.arguments;
    // Some gateways send the arguments object directly instead of a JSON
    // string. Normalize the shape instead of dropping the payload.
    const incoming = typeof args === "string"
        ? args
        : args !== undefined && args !== null
            ? JSON.stringify(args)
            : "";
    if (incoming) {
        // Cumulative dialects resend the whole arguments object instead of a
        // fragment. Detect a complete JSON object and replace, never append
        // (`{"a":1}` + `{"a":1}` used to become invalid `{"a":1}{"a":1}`).
        entry.arguments = isCompleteArguments(incoming) ? incoming : entry.arguments + incoming;
    }
    accumulator.set(index, entry);
}

function isCompleteArguments(value: string): boolean {
    const text = value.trim();
    if (!text.startsWith("{"))
        return false;
    try {
        const parsed = JSON.parse(text);
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
    }
    catch {
        return false;
    }
}

/**
 * Pick the accumulator slot for a delta.
 *
 * Servers are supposed to send a numeric `index`, but some (Ollama variants,
 * proxies) omit it. Falling back to `accumulator.size` made every chunk a new
 * call, so `{"command":"ls"}` arrived as three truncated arguments strings.
 */
function resolveIndex(accumulator: ToolCallAccumulator, delta: ToolCallDelta): number {
    if (typeof delta.index === "number" && Number.isFinite(delta.index))
        return delta.index;
    const entries = Array.from(accumulator.entries());
    if (entries.length === 0)
        return 0;
    if (typeof delta.id === "string" && delta.id) {
        const sameId = entries.find(([, call]) => call.id === delta.id);
        if (sameId)
            return sameId[0];
        const unnamed = entries.filter(([, call]) => !call.id);
        if (unnamed.length === 1)
            return unnamed[0][0];
        return nextIndex(accumulator);
    }
    // No index and no id: streaming chunks of one call arrive in order, so
    // append to the most recent slot rather than inventing one per chunk.
    // Exception: a second complete arguments object is a new call, not a
    // fragment of the closed one.
    const last = entries[entries.length - 1];
    const incoming = typeof delta.function?.arguments === "string"
        ? delta.function.arguments
        : delta.function?.arguments
            ? JSON.stringify(delta.function.arguments)
            : "";
    if (isCompleteArguments(last[1].arguments) && isCompleteArguments(incoming))
        return nextIndex(accumulator);
    return last[0];
}

function nextIndex(accumulator: ToolCallAccumulator): number {
    let next = 0;
    for (const key of accumulator.keys())
        next = Math.max(next, key + 1);
    return next;
}

export function finalizeToolCalls(accumulator: ToolCallAccumulator): NativeToolCall[] {
    return Array.from(accumulator.entries())
        .sort((a, b) => a[0] - b[0])
        .filter(([, call]) => Boolean(call.name))
        .map(([index, call]) => ({
            id: call.id || `call_${index}`,
            name: call.name,
            arguments: call.arguments || "{}",
        }));
}
