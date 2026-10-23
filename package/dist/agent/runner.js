import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { estMessagesTokens, estTokens, getModelMeta } from "../lib/model-meta.js";
import { compactMessages, DEFAULT_COMPACTION_CONFIG } from "./compaction.js";
import { isLoopExempt, isReadOnlyToolCall, toolCallFingerprint } from "./guards.js";
import { isNativeUnsupportedError } from "./protocol-mode.js";
import { formatToolResults, parseToolCalls, stripToolCalls } from "./protocol.js";
import { runStream } from "./stream.js";
import { runAgentTool } from "./tools.js";
export const LOOP_WARNING = "[loop detection] You appear to be repeating the same tool call. " +
    "Do not repeat it again: inspect the result you already have, or change approach.";
/**
 * Sliding-window loop detector.
 *
 * Semantics (fixed by FC-004, do not re-interpret):
 * - hits count the last `window` tool calls, not turns;
 * - read-only tools use a higher threshold than side-effecting tools (D-02);
 * - the first threshold hit yields a warning and resets that fingerprint's count;
 * - only a second full accumulation yields a terminal error;
 * - the table lives for one run (turn), so a new user task starts clean;
 * - fingerprints are normalized per tool call (absolute paths, timeoutMs removed).
 */
class LoopState {
    entries = new Map();
    calls = 0;
    readOnlyThreshold;
    sideEffectThreshold;
    window;
    exemptReadOnly;
    constructor(options = {}) {
        this.readOnlyThreshold = positive(options.readOnlyThreshold, 6);
        this.sideEffectThreshold = positive(options.sideEffectThreshold, 3);
        this.window = positive(options.window, 5);
        this.exemptReadOnly = options.exemptReadOnly === true;
    }
    check(fingerprint, readOnly) {
        if (readOnly && this.exemptReadOnly)
            return { action: "ok", occurrences: 0 };
        this.calls += 1;
        const index = this.calls;
        let entry = this.entries.get(fingerprint);
        if (!entry) {
            entry = { warned: false, hits: [] };
            this.entries.set(fingerprint, entry);
        }
        entry.hits = entry.hits.filter((hit) => index - hit < this.window);
        entry.hits.push(index);
        const threshold = readOnly ? this.readOnlyThreshold : this.sideEffectThreshold;
        if (entry.hits.length < threshold)
            return { action: "ok", occurrences: entry.hits.length };
        const occurrences = entry.hits.length;
        if (!entry.warned) {
            entry.warned = true;
            entry.hits = [];
            return { action: "warn", occurrences };
        }
        return { action: "stop", occurrences };
    }
}
export async function* runAgent(options) {
    const provider = options.provider;
    const model = options.model;
    const cwd = options.cwd ?? process.cwd();
    const signal = options.signal;
    const maxTurns = Math.max(1, Math.floor(positive(options.maxTurns, 8)));
    const tokenBudget = optionalPositive(options.tokenBudget);
    const costBudget = optionalPositive(options.costBudgetUsd);
    const loop = new LoopState(options.loopDetection);
    let history = [...(options.messages ?? []), { role: "user", content: options.prompt }];
    let currentText = "";
    let lastVisible = "";
    let consumedInput = 0;
    let spentCost = 0;
    let stopReason = "complete";
    let errorMessage = "";
    let naturalFinish = false;
    let toolCallSeq = 0;
    let protocol = options.protocol ?? "legacy";
    let fellBack = false;
    const activeFiles = new Map();
    for (let turn = 0; turn < maxTurns; turn += 1) {
        if (signal?.aborted) {
            stopReason = "aborted";
            break;
        }
        for (const steering of options.takeSteering?.() ?? []) {
            history = [...history, { role: "system", content: "[user steering] " + steering }];
            yield { type: "notice", text: "Steering applied to the next request." };
        }
        const contextWindow = options.contextWindow ?? getModelMeta(provider.id, model).contextWindow;
        const compacted = compactMessages(history, options.compaction ?? DEFAULT_COMPACTION_CONFIG, {
            contextWindow,
            providerId: provider.id,
            model,
            serverOpaqueState: options.serverOpaqueState,
        });
        if (compacted.compacted) {
            history = compacted.messages;
            yield {
                type: "compaction",
                beforeChars: compacted.beforeChars,
                afterChars: compacted.afterChars,
                beforeTokens: compacted.beforeTokens,
                afterTokens: compacted.afterTokens,
                droppedMessages: compacted.droppedMessages,
                keptMessages: compacted.keptMessages,
                reason: compacted.reason ?? "threshold",
                source: compacted.source === "server" ? "server" : "local",
                summaryFile: compacted.summaryFile,
            };
        }
        const promptTokens = estMessagesTokens(history, { providerId: provider.id, model }) +
            estTokens(options.system ?? "", { providerId: provider.id, model });
        if (tokenBudget !== undefined && consumedInput + promptTokens > tokenBudget) {
            stopReason = "token_budget";
            errorMessage = `Token budget exhausted (${consumedInput + promptTokens} > ${tokenBudget} estimated input tokens). Partial output is kept.`;
            yield { type: "error", kind: "token_budget", message: errorMessage, text: lastVisible, used: consumedInput + promptTokens };
            break;
        }
        if (costBudget !== undefined && spentCost >= costBudget) {
            stopReason = "cost_budget";
            errorMessage = `Cost budget exhausted ($${spentCost.toFixed(4)} of $${costBudget}). Partial output is kept.`;
            yield { type: "error", kind: "cost_budget", message: errorMessage, text: lastVisible };
            break;
        }
        currentText = "";
        let resetNotice = "";
        let streamed;
        try {
            streamed = await runStream(provider, {
                model,
                messages: history,
                system: options.system,
                reasoningEffort: options.reasoningEffort,
                ...(protocol === "native" && options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
            }, options.apiKey, {
                signal,
                idleTimeoutMs: options.idleTimeoutMs,
                onDelta: (delta, text) => {
                    currentText = text;
                    options.onDelta?.(delta, text);
                },
                onReset: () => {
                    resetNotice = "Retried stream returned different content; the earlier partial output was discarded and replaced by the new stream.";
                },
            });
        }
        catch (err) {
            if (err?.name === "AbortError" || signal?.aborted) {
                stopReason = "aborted";
                break;
            }
            errorMessage = String(err?.message ?? err);
            if (protocol === "native" && !fellBack && isNativeUnsupportedError(errorMessage)) {
                fellBack = true;
                protocol = "legacy";
                options.onProtocolFallback?.(`Native tools were rejected (${errorMessage.slice(0, 160)}); retrying with the pseudo protocol.`);
                turn -= 1;
                continue;
            }
            stopReason = "stream_error";
            const partial = stripToolCalls(String(err?.partialText ?? "")).trim();
            if (partial)
                lastVisible = partial;
            yield { type: "error", kind: "stream_error", message: errorMessage, text: partial || undefined };
            break;
        }
        if (signal?.aborted) {
            stopReason = "aborted";
            break;
        }
        if (resetNotice)
            yield { type: "notice", text: resetNotice };
        if (streamed.usage) {
            consumedInput += streamed.usage.inputTokens ?? promptTokens;
            spentCost += streamed.usage.costUsd ?? 0;
            yield { type: "usage", usage: streamed.usage };
        }
        else {
            consumedInput += promptTokens;
        }
        if (streamed.incomplete) {
            const partial = stripToolCalls(streamed.text).trim();
            if (partial)
                lastVisible = partial;
            stopReason = "incomplete";
            errorMessage = `Connection ended before the response finished${streamed.retried > 0 ? ` (retried ${streamed.retried}×)` : ""}. ` +
                "Partial output is kept — type 继续 to continue.";
            yield { type: "notice", text: errorMessage };
            yield { type: "checkpoint", turn: turn + 1, cwd, providerId: provider.id, model, activeFiles: Array.from(activeFiles.values()) };
            break;
        }
        const visibleText = stripToolCalls(streamed.text);
        if (visibleText)
            lastVisible = visibleText;
        const nativeCalls = protocol === "native" && options.allowTools !== false ? (streamed.toolCalls ?? []) : [];
        if (nativeCalls.length > 0) {
            yield { type: "assistant_raw", text: streamed.text, toolCalls: nativeCalls };
            if (visibleText)
                yield { type: "assistant_text", text: visibleText };
            history = [...history, { role: "assistant", content: streamed.text, toolCalls: nativeCalls }];
            for (const native of nativeCalls) {
                if (signal?.aborted) {
                    stopReason = "aborted";
                    break;
                }
                const id = native.id || `tc_${++toolCallSeq}`;
                let call;
                let parseError = "";
                try {
                    const args = native.arguments ? JSON.parse(native.arguments) : {};
                    if (!args || typeof args !== "object" || Array.isArray(args))
                        throw new Error("arguments must be a JSON object");
                    call = { ...args, tool: native.name };
                }
                catch (err) {
                    parseError = `invalid arguments for ${native.name}: ${err?.message ?? String(err)}`;
                    call = { tool: native.name };
                }
                const fingerprint = toolCallFingerprint(call, cwd);
                if (!isLoopExempt(call.tool)) {
                    const verdict = loop.check(fingerprint, isReadOnlyToolCall(call));
                    if (verdict.action === "warn") {
                        yield { type: "loop_detected", fingerprint, occurrences: verdict.occurrences, warned: false };
                        history = [...history, { role: "system", content: LOOP_WARNING }];
                    }
                    else if (verdict.action === "stop") {
                        stopReason = "loop_detected";
                        errorMessage = `Loop detected: the same tool call repeated ${verdict.occurrences} times. Stopped before executing it again.`;
                        yield { type: "error", kind: "loop_detected", message: errorMessage, text: lastVisible };
                        break;
                    }
                }
                yield { type: "tool_call", id, call, native: true };
                const result = parseError
                    ? { ok: false, output: parseError }
                    : await runAgentTool(call, cwd, { signal, turn: turn + 1 });
                trackSideEffects(activeFiles, result.sideEffects);
                yield { type: "tool_result", id, call, ok: Boolean(result.ok), output: String(result.output ?? ""), sideEffects: result.sideEffects };
                history = [...history, { role: "tool", toolCallId: id, content: String(result.output ?? "") }];
            }
            yield { type: "checkpoint", turn: turn + 1, cwd, providerId: provider.id, model, activeFiles: Array.from(activeFiles.values()) };
            if (stopReason === "complete")
                options.onNativeOk?.();
            if (stopReason !== "complete")
                break;
            continue;
        }
        const calls = options.allowTools === false ? [] : parseToolCalls(streamed.text);
        yield { type: "assistant_raw", text: streamed.text };
        if (calls.length === 0) {
            lastVisible = visibleText || streamed.text;
            naturalFinish = true;
            stopReason = "complete";
            yield { type: "checkpoint", turn: turn + 1, cwd, providerId: provider.id, model, activeFiles: Array.from(activeFiles.values()) };
            break;
        }
        history = [...history, { role: "assistant", content: streamed.text }];
        if (visibleText)
            yield { type: "assistant_text", text: visibleText };
        const results = [];
        for (const call of calls) {
            if (signal?.aborted) {
                stopReason = "aborted";
                break;
            }
            const fingerprint = toolCallFingerprint(call, cwd);
            if (!isLoopExempt(call.tool)) {
                const verdict = loop.check(fingerprint, isReadOnlyToolCall(call));
                if (verdict.action === "warn") {
                    yield { type: "loop_detected", fingerprint, occurrences: verdict.occurrences, warned: false };
                    history = [...history, { role: "system", content: LOOP_WARNING }];
                }
                else if (verdict.action === "stop") {
                    stopReason = "loop_detected";
                    errorMessage = `Loop detected: the same tool call repeated ${verdict.occurrences} times. Stopped before executing it again.`;
                    yield { type: "error", kind: "loop_detected", message: errorMessage, text: lastVisible };
                    break;
                }
            }
            const id = `tc_${++toolCallSeq}`;
            yield { type: "tool_call", id, call };
            const result = await runAgentTool(call, cwd, { signal, turn: turn + 1 });
            results.push({ call, ok: Boolean(result.ok), output: String(result.output ?? ""), sideEffects: result.sideEffects });
            trackSideEffects(activeFiles, result.sideEffects);
            yield { type: "tool_result", id, call, ok: Boolean(result.ok), output: String(result.output ?? ""), sideEffects: result.sideEffects };
        }
        if (results.length > 0)
            history = [...history, { role: "user", content: formatToolResults(results) }];
        yield { type: "checkpoint", turn: turn + 1, cwd, providerId: provider.id, model, activeFiles: Array.from(activeFiles.values()) };
        if (stopReason !== "complete")
            break;
    }
    if (stopReason === "stream_error") {
        const partial = lastVisible;
        if (partial)
            history = [...history, { role: "assistant", content: partial }];
        yield { type: "done", history, finalText: partial, stopReason };
        return;
    }
    if (stopReason === "complete" && !naturalFinish)
        stopReason = "max_turns";
    let finalText = "";
    if (stopReason === "aborted") {
        const partial = stripToolCalls(currentText).trim() || lastVisible;
        finalText = (partial ? partial + "\n\n" : "") + "[用户中断]";
        yield { type: "error", kind: "aborted", message: "Cancelled.", text: partial };
    }
    else if (stopReason === "token_budget" || stopReason === "cost_budget" || stopReason === "loop_detected" || stopReason === "incomplete") {
        finalText = lastVisible || errorMessage;
    }
    else if (stopReason === "max_turns") {
        finalText = `Reached the maximum of ${maxTurns} agent tool turns. The work so far is kept in this session — type 继续 to keep going.`;
    }
    else {
        finalText = lastVisible;
    }
    if (finalText)
        history = [...history, { role: "assistant", content: finalText }];
    yield { type: "done", history, finalText, stopReason };
}
function positive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function optionalPositive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
function trackSideEffects(activeFiles, sideEffects) {
    if (!sideEffects)
        return;
    for (const file of [...(sideEffects.touched ?? []), ...(sideEffects.created ?? [])]) {
        const meta = describeActiveFile(file);
        if (meta)
            activeFiles.set(file, meta);
    }
    for (const file of sideEffects.removed ?? [])
        activeFiles.delete(file);
}
function describeActiveFile(file) {
    try {
        const info = statSync(file);
        if (!info.isFile())
            return undefined;
        const sha1_8 = info.size > 8 * 1024 * 1024
            ? "large"
            : createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 8);
        return { path: file, sha1_8, mtime: info.mtime.toISOString() };
    }
    catch {
        return undefined;
    }
}
