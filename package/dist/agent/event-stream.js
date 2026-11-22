/**
 * Canonical event-stream serialization.
 *
 * TUI consumers read AgentEvent objects directly; JSON/NDJSON consumers use
 * this module so every transport gets the same envelope and event names.
 */
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
export const EVENT_STREAM_VERSION = 1;
export class EventStream {
    sessionId;
    sink;
    seq = 0;
    turn = 1;
    constructor(sessionId, sink = (line) => process.stdout.write(line)) {
        this.sessionId = sessionId;
        this.sink = sink;
    }
    setTurn(turn) {
        if (Number.isFinite(turn) && turn > 0)
            this.turn = Math.floor(turn);
    }
    emit(event, turn = this.turn) {
        this.seq += 1;
        const frame = {
            v: EVENT_STREAM_VERSION,
            seq: this.seq,
            ts: new Date().toISOString(),
            session_id: this.sessionId,
            turn,
            ...event,
        };
        this.sink(JSON.stringify(frame) + "\n");
    }
}
export function headlessSessionId(resume) {
    if (resume) {
        const id = basename(resume).replace(/[.]jsonl$/i, "");
        if (id)
            return id;
    }
    return `headless-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
/** Map an AgentEvent to its stable NDJSON payload (without the envelope). */
export function serializeAgentEvent(event) {
    switch (event.type) {
        case "assistant_raw":
            return event.reasoning ? { event: "reasoning", text: event.reasoning } : undefined;
        case "assistant_text":
            return { event: "assistant", text: event.text };
        case "tool_call":
            return {
                event: "tool_call",
                id: event.id,
                tool: event.call.tool,
                args: event.call,
                ...(event.native ? { native: true } : {}),
            };
        case "tool_result":
            return {
                event: "tool_result",
                id: event.id,
                tool: event.call.tool,
                ok: event.ok,
                output: event.output,
                ...(event.sideEffects ? { side_effects: event.sideEffects } : {}),
                ...(event.code ? { code: event.code } : {}),
                ...(event.hint ? { hint: event.hint } : {}),
                ...(event.truncated !== undefined ? { truncated: event.truncated } : {}),
                ...(event.totalLines !== undefined ? { total_lines: event.totalLines } : {}),
                ...(event.returnedLines !== undefined ? { returned_lines: event.returnedLines } : {}),
                ...(event.totalBytes !== undefined ? { total_bytes: event.totalBytes } : {}),
                ...(event.returnedBytes !== undefined ? { returned_bytes: event.returnedBytes } : {}),
                ...(event.filesRead !== undefined ? { files_read: event.filesRead } : {}),
                ...(event.filesSkipped !== undefined ? { files_skipped: event.filesSkipped } : {}),
                ...(event.matches !== undefined ? { matches: event.matches } : {}),
                ...(event.oldText !== undefined ? { old_text: event.oldText } : {}),
                ...(event.newText !== undefined ? { new_text: event.newText } : {}),
                ...(event.changedStartLine !== undefined ? { changed_start_line: event.changedStartLine } : {}),
                ...(event.oldLineCount !== undefined ? { old_line_count: event.oldLineCount } : {}),
                ...(event.newLineCount !== undefined ? { new_line_count: event.newLineCount } : {}),
                ...(event.diffTruncated !== undefined ? { diff_truncated: event.diffTruncated } : {}),
                ...(event.diffs ? { diffs: event.diffs } : {}),
                ...(event.atomic === false ? { atomic: false } : {}),
                ...(event.check ? { check: event.check } : {}),
            };
        case "loop_detected":
            return {
                event: "loop_detected",
                fingerprint: event.fingerprint,
                occurrences: event.occurrences,
                warned: event.warned,
            };
        case "compaction":
            return {
                event: "compaction",
                before_chars: event.beforeChars,
                after_chars: event.afterChars,
                before_tokens: event.beforeTokens,
                after_tokens: event.afterTokens,
                dropped_messages: event.droppedMessages,
                kept_messages: event.keptMessages,
                reason: event.reason,
                source: event.source,
                ...(event.summaryFile ? { summary_file: event.summaryFile } : {}),
            };
        case "checkpoint":
            return {
                event: "checkpoint",
                turn: event.turn,
                cwd: event.cwd,
                provider_id: event.providerId,
                model: event.model,
                active_files: event.activeFiles,
            };
        case "egress_denied":
            return {
                event: "egress_denied",
                outlet: event.outlet,
                ...(event.target ? { target: event.target } : {}),
                rule: event.rule,
                mode: event.mode,
                would_block: event.wouldBlock,
                code: event.code,
                reason: event.reason,
            };
        case "usage":
            return {
                event: "usage",
                input_tokens: event.usage.inputTokens ?? 0,
                output_tokens: event.usage.outputTokens ?? 0,
                cost_usd: event.usage.costUsd ?? 0,
            };
        case "notice":
            return { event: "notice", text: event.text };
        case "error":
            return {
                event: "error",
                kind: event.kind,
                code: event.kind,
                message: event.message,
                ...(event.detail ? { detail: event.detail } : {}),
            };
        case "done":
            return { event: "done", stopReason: event.stopReason, finalText: event.finalText };
        default:
            return undefined;
    }
}
