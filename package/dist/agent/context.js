const TOOL_MARKER = "FastCode executed the requested local tools.";
export function historyChars(messages) {
    return messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
}
export function compactHistory(messages, options = {}) {
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
    const marker = {
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
function summarizeMessage(content, limit) {
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
function summarizeToolMessage(content, limit) {
    if (content.length <= limit)
        return content;
    const keep = Math.max(120, Math.floor((limit - 240) / 2));
    const head = content.slice(0, keep);
    const tail = content.slice(-keep);
    return `${head}\n[… ${content.length - keep * 2} chars of tool output summarized; re-run the tool if you need the middle …]\n${tail}`;
}
function positive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
