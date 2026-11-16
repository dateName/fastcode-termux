export interface ToolCallRecord {
    tool: string;
    [key: string]: any;
}
export interface ToolCallParseResult {
    calls: ToolCallRecord[];
    /** End offset of the last complete construct that was consumed. */
    consumedEnd: number;
    /** True parse failures. Salvaged calls do not add an error. */
    errors: string[];
    /** Stable machine codes for the errors where one is known. */
    errorCodes: string[];
    /**
     * Marker families recognized in the text, even when they produced no call.
     * A non-empty list with zero calls must block a "complete" stop reason.
     */
    detectedDialects: string[];
}
/**
 * Parse all complete tool calls, then salvage only the *remaining* text.
 *
 * Invariants (regression-tested):
 * - a complete construct is consumed exactly once and never rescanned;
 * - the salvage pass receives `raw.slice(consumedEnd)`, never the full text;
 * - two adjacent normal calls plus a stray close tag stays at two calls.
 */
export declare function parseToolCalls(text: any): ToolCallParseResult;
export declare function stripToolCalls(text: any): string;
export declare function formatToolResults(results: any): string;
export declare const AGENT_SYSTEM_PROMPT: string;
