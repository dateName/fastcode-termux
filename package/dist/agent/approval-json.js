import { decisionForOption } from "./approval.js";
export const GATE_PROTOCOL_VERSION = 1;
function optionId(option, index) {
    return option.id ?? `${option.kind}-${index}`;
}
function targetsFor(request) {
    const args = request.args ?? {};
    const values = [args.path, args.from, args.to, args.cwd, request.preview?.kind === "diff" ? "diff" : undefined];
    return values.filter((value) => typeof value === "string" && value.length > 0);
}
function diffStatFor(diffs, fallback) {
    if (diffs?.length) {
        let added = 0;
        let removed = 0;
        for (const diff of diffs) {
            for (const line of diff.unified.split(/\r?\n/)) {
                if (line.startsWith("+++") || line.startsWith("---"))
                    continue;
                if (line.startsWith("+"))
                    added += 1;
                else if (line.startsWith("-"))
                    removed += 1;
            }
        }
        return { files: diffs.length, lines: added + removed, added, removed };
    }
    const lines = fallback ? fallback.split(/\r?\n/).length : 0;
    return { files: fallback ? fallback.split(/\r?\n/).filter(Boolean).length : 0, lines, added: 0, removed: 0 };
}
export function encodeGateAsk(request, viewOptions = {}) {
    const options = request.options.map((option, index) => ({
        id: optionId(option, index),
        label: option.label,
        kind: option.kind,
        ...(index === (request.defaultIndex ?? 0) ? { default: true } : {}),
    }));
    const defaultIndex = Math.max(0, Math.min(request.defaultIndex ?? 0, options.length - 1));
    const text = request.preview?.kind === "diff" ? request.preview.text : "";
    const feedbackOption = request.options.find((option) => option.kind === "feedback");
    const requireInput = request.freeInput?.prompt ?? feedbackOption?.prompt;
    return {
        event: "gate:ask",
        v: GATE_PROTOCOL_VERSION,
        id: request.id,
        tier: request.tier ?? 2,
        action: request.tool,
        reason: request.reason,
        prompt: request.prompt ?? "Approval required",
        source: request.source ?? "system",
        targets: targetsFor(request),
        diffstat: diffStatFor(viewOptions.diffPreview === false ? undefined : request.patchDiffs, text),
        ...(viewOptions.diffPreview !== false && request.patchDiffs?.length ? { diffs: request.patchDiffs } : {}),
        options,
        default: options[defaultIndex]?.id ?? "",
        ...(requireInput ? { require_input: requireInput } : {}),
    };
}
/**
 * Output frame for a resolved decision. Headless mode has no session log, so
 * this frame is its only durable record; TUI mode records an `approval` fact.
 */
export function encodeGateDecision(request, decision, error) {
    const payload = decision.kind === "allow"
        ? { kind: "allow", scope: decision.scope }
        : decision.kind === "deny"
            ? { kind: "deny", ...(decision.reason ? { reason: decision.reason } : {}) }
            : decision.kind === "feedback"
                ? { kind: "feedback", feedback: decision.text }
                : { kind: decision.kind };
    return {
        event: "gate:decision",
        v: GATE_PROTOCOL_VERSION,
        id: request.id,
        decision: payload,
        ...(error ? { error } : {}),
    };
}
/**
 * Accept only a well-formed decision for this exact request id and one of its
 * stable option ids. Malformed JSON, wrong ids, unknown options and missing
 * required input all fail closed.
 */
export function parseGateDecision(request, line) {
    let payload;
    try {
        payload = JSON.parse(line);
    }
    catch {
        return { decision: { kind: "deny", reason: "malformed JSON decision" }, error: "malformed JSON" };
    }
    if (!payload || typeof payload !== "object" || (payload.v !== GATE_PROTOCOL_VERSION && payload.version !== GATE_PROTOCOL_VERSION))
        return { decision: { kind: "deny", reason: "unsupported gate protocol version" }, error: "version" };
    if (payload.event !== "gate:decision")
        return { decision: { kind: "deny", reason: "unexpected gate event" }, error: "event" };
    if (payload.id !== request.id)
        return { decision: { kind: "deny", reason: "decision id does not match the pending request" }, error: "id" };
    if (request.freeInput?.enabled && (typeof payload.input !== "string" || payload.input.trim() === ""))
        return { decision: { kind: "deny", reason: "required free input is missing" }, error: "input" };
    const option = request.options.find((entry, index) => optionId(entry, index) === payload.option);
    if (!option)
        return { decision: { kind: "deny", reason: "unknown approval option id" }, error: "option" };
    if (option.kind === "feedback") {
        const text = typeof payload.input === "string" ? payload.input.trim() : "";
        if (!text)
            return { decision: { kind: "deny", reason: "feedback input is required" }, error: "feedback" };
        return { decision: { kind: "feedback", text } };
    }
    return { decision: decisionForOption(option) };
}
