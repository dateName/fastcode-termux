import type { NativeToolCall } from "../types.js";

export type ToolCallAccumulator = Map<number, NativeToolCall>;

export interface ToolCallDelta {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
}

export function mergeToolCallDelta(accumulator: ToolCallAccumulator, delta: ToolCallDelta): void {
    const index = typeof delta.index === "number" && Number.isFinite(delta.index) ? delta.index : accumulator.size;
    const entry = accumulator.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof delta.id === "string" && delta.id)
        entry.id = delta.id;
    if (typeof delta.function?.name === "string" && delta.function.name)
        entry.name = delta.function.name;
    if (typeof delta.function?.arguments === "string")
        entry.arguments += delta.function.arguments;
    accumulator.set(index, entry);
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
