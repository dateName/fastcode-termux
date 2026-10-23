import type { NativeToolCall } from "../types.js";
export type ToolCallAccumulator = Map<number, NativeToolCall>;
export interface ToolCallDelta {
    index?: number;
    id?: string;
    function?: {
        name?: string;
        arguments?: string;
    };
}
export declare function mergeToolCallDelta(accumulator: ToolCallAccumulator, delta: ToolCallDelta): void;
export declare function finalizeToolCalls(accumulator: ToolCallAccumulator): NativeToolCall[];
