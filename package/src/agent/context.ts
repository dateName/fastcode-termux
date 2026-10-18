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

const TOOL_MARKER = "FastCode executed the requested local tools.";

export function historyChars(messages: ChatMessage[]): number {
    return messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
}

export function compactHistory(messages: ChatMessage[], options: CompactOptions = {}): CompactResult {
    const beforeChars = historyChars(messages);
    const maxChars = positive(options.maxChars, 400_000);
    const keepRecent = Math.max(2, Math.floor(positive(options.keepRecent, 6)));
    const toolSummaryChars = Math.max(200, Math.floor(positive(options.toolSummaryChars, 2_000)));
    if (beforeChars <= maxChars || messages.length <= keepRecent + 1) {
        return { messages, compacted: false, beforeChars, afterChars: beforeChars };
    }
    // Keep the original request (usually the first message) plus the newest
    // turns. Everything between is summarized, never dropped without a marker.
    const head = messages[0]?.role === "user" ? [messages[0]] : [];
    const tailStart = Math.max(head.length, messages.length - keepRecent);
    const middle = messages.slice(head.length, tailStart);
    const summarized = middle.map((message) => ({
        role: message.role,
        content: summarizeMessage(message.content, toolSummaryChars),
    }));
    const marker: ChatMessage = {
        role: "system",
        content: `[context compacted: ${middle.length} earlier message(s) were summarized to stay within the context window. ` +
            `Recent tool results are kept in full. If an earlier detail is missing, re-read that file with a tool.]`,
    };
    const next = [...head, marker, ...summarized, ...messages.slice(tailStart)];
    return {
        messages: next,
        compacted: true,
        beforeChars,
        afterChars: historyChars(next),
    };
}

function summarizeMessage(content: string, limit: number): string {
    if (!content)
        return content;
    if (content.includes(TOOL_MARKER))
        return summarizeToolMessage(content, limit);
    if (content.length <= limit)
        return content;
    const head = content.slice(0, Math.floor(limit * 0.6));
    const tail = content.slice(-Math.floor(limit * 0.3));
    return `${head}\n[… ${content.length - head.length - tail.length} chars summarized …]\n${tail}`;
}

/**
 * Tool results have the shape:
 *   FastCode executed ...\n\nTool result 1 (ok)\ncall: {...}\noutput:\n```...```
 * Keep the call and the start/end of each output so file paths and errors
 * survive compaction.
 */
function summarizeToolMessage(content: string, limit: number): string {
    if (content.length <= limit)
        return content;
    const keep = Math.max(120, Math.floor((limit - 240) / 2));
    const head = content.slice(0, keep);
    const tail = content.slice(-keep);
    return `${head}\n[… ${content.length - keep * 2} chars of tool output summarized; re-run the tool if you need the middle …]\n${tail}`;
}

function positive(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
