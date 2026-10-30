/**
 * Stable NDJSON gate protocol for GUI/JSON clients.
 *
 * This module is pure: it validates and encodes one request/decision at a
 * time. A headless transport can consume it without leaking TUI output to
 * stdout. Hard Block requests never reach this code.
 */
import type { ApprovalDecision, ApprovalOption, ApprovalRequest } from "./approval.js";
import { decisionForOption } from "./approval.js";

export const GATE_PROTOCOL_VERSION = 1;

export interface GateAskEvent {
    event: "gate:ask";
    version: number;
    id: string;
    tier: number;
    action: string;
    reason: string;
    prompt: string;
    source: string;
    targets: string[];
    diffstat: { files: number; lines: number };
    options: Array<{ id: string; label: string; kind: string; default?: boolean }>;
    default: string;
    require_input?: string;
}

function optionId(option: ApprovalOption, index: number): string {
    return option.id ?? `${option.kind}-${index}`;
}

function targetsFor(request: ApprovalRequest): string[] {
    const args: any = request.args ?? {};
    const values = [args.path, args.from, args.to, args.cwd, request.preview?.kind === "diff" ? "diff" : undefined];
    return values.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function encodeGateAsk(request: ApprovalRequest): GateAskEvent {
    const options = request.options.map((option, index) => ({
        id: optionId(option, index),
        label: option.label,
        kind: option.kind,
        ...(index === (request.defaultIndex ?? 0) ? { default: true } : {}),
    }));
    const defaultIndex = Math.max(0, Math.min(request.defaultIndex ?? 0, options.length - 1));
    const text = request.preview?.kind === "diff" ? request.preview.text : "";
    return {
        event: "gate:ask",
        version: GATE_PROTOCOL_VERSION,
        id: request.id,
        tier: request.tier ?? 2,
        action: request.tool,
        reason: request.reason,
        prompt: request.prompt ?? "Approval required",
        source: request.source ?? "system",
        targets: targetsFor(request),
        diffstat: { files: text ? text.split(/\r?\n/).filter(Boolean).length : 0, lines: text ? text.split(/\r?\n/).length : 0 },
        options,
        default: options[defaultIndex]?.id ?? "",
        ...(request.freeInput?.enabled ? { require_input: request.freeInput.prompt } : {}),
    };
}

export interface GateDecisionResult {
    decision: ApprovalDecision;
    error?: string;
}

/**
 * Accept only a well-formed decision for this exact request id and one of its
 * stable option ids. Malformed JSON, wrong ids, unknown options and missing
 * required input all fail closed.
 */
export function parseGateDecision(request: ApprovalRequest, line: string): GateDecisionResult {
    let payload: any;
    try {
        payload = JSON.parse(line);
    }
    catch {
        return { decision: { kind: "deny", reason: "malformed JSON decision" }, error: "malformed JSON" };
    }
    if (!payload || typeof payload !== "object" || payload.version !== GATE_PROTOCOL_VERSION)
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
    return { decision: decisionForOption(option) };
}
