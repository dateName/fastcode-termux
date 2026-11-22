/** Exhaustiveness helper for closed unions. Adding a variant fails to compile. */
export declare function assertNever(value: never, context: string): never;
export interface StructuredDiff {
    oldText: string;
    newText: string;
    changedStartLine: number;
    oldLineCount: number;
    newLineCount: number;
    truncated: boolean;
}
/** Bounded old/new text plus a line anchor for edit review. */
/** ToolResult/AgentEvent-compatible flat fields, so callers don't copy them. */
export declare function structuredDiffFields(diff: StructuredDiff): {
    oldText: string;
    newText: string;
    changedStartLine: number;
    oldLineCount: number;
    newLineCount: number;
    diffTruncated: boolean;
};
export declare function buildStructuredDiff(oldText: string, newText: string, limit?: number): StructuredDiff;
export interface RepairedJsonObject {
    value?: Record<string, unknown>;
    repaired: boolean;
    error?: string;
}
/**
 * Parse a tool-call arguments string, applying one conservative repair pass for
 * common model mistakes: trailing commas, an unclosed string, missing closing
 * braces/brackets, and a single-element array wrapper. Unknown or type-wrong
 * fields are left to the normal tool validation so they still fail explicitly.
 */
export declare function parseJsonObjectWithRepair(raw: string): RepairedJsonObject;
