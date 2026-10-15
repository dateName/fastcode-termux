/**
 * Single source of truth for how much tool output reaches the model.
 *
 * Output is bounded while it is produced, not by slicing a finished string
 * afterwards, so a runaway command or a huge directory listing cannot grow
 * without limit. Override the cap with FASTCODE_TOOL_OUTPUT_LIMIT (characters).
 */
export declare const DEFAULT_TOOL_OUTPUT_LIMIT = 30000;
export declare function toolOutputLimit(): number;
/**
 * Bounded text accumulator.
 *
 * mode "head" keeps the first N characters (listings, search hits);
 * mode "tail" keeps the last N (command logs, where the error is last).
 * trimEnd()/toString() mimic a plain string so callers stay simple.
 */
export declare function createOutputBuffer(limit?: number, mode?: string): {
    readonly full: boolean;
    push(chunk: any): void;
    line(value: any): void;
    value(): string;
    trimEnd(): string;
    toString(): string;
};
