/**
 * Context compaction for long agent sessions.
 *
 * The chat loop keeps appending tool results to the conversation, so a long
 * investigation can grow past the model's window and fail with a provider 400.
 * Instead of silently truncating the tail (which loses the current task), we
 * keep the first user request and the most recent turns, and shrink the middle
 * into short summaries with an explicit marker.
 *
 * Token counts are approximated at 4 characters per token. That is deliberately
 * crude: it must work for every provider without a tokenizer dependency.
 */
import type { ChatMessage } from "../types.js";
export interface CompactOptions {
    /** Character budget for the whole history (default 400k ≈ 100k tokens). */
    maxChars?: number;
    /** Number of trailing messages to keep verbatim. */
    keepRecent?: number;
    /** Maximum characters kept from one old tool result. */
    toolSummaryChars?: number;
}
export interface CompactResult {
    messages: ChatMessage[];
    compacted: boolean;
    beforeChars: number;
    afterChars: number;
}
export declare function historyChars(messages: ChatMessage[]): number;
export declare function compactHistory(messages: ChatMessage[], options?: CompactOptions): CompactResult;
