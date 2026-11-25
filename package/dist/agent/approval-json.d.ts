/**
 * Stable NDJSON gate protocol for GUI/JSON clients.
 *
 * This module is pure: it validates and encodes one request/decision at a
 * time. A headless transport can consume it without leaking TUI output to
 * stdout. Hard Block requests never reach this code.
 */
import type { ApprovalDecision, ApprovalRequest, PatchDiff } from "./approval.js";
export declare const GATE_PROTOCOL_VERSION = 1;
export interface GateAskEvent {
    event: "gate:ask";
    v: number;
    id: string;
    tier: number;
    action: string;
    reason: string;
    prompt: string;
    source: string;
    targets: string[];
    diffstat: {
        files: number;
        lines: number;
        added: number;
        removed: number;
    };
    diffs?: PatchDiff[];
    options: Array<{
        id: string;
        label: string;
        kind: string;
        default?: boolean;
    }>;
    default: string;
    require_input?: string;
}
export declare function encodeGateAsk(request: ApprovalRequest, viewOptions?: {
    diffPreview?: boolean;
}): GateAskEvent;
export interface GateDecisionEvent {
    event: "gate:decision";
    v: number;
    id: string;
    decision: {
        kind: string;
        scope?: string;
        reason?: string;
        feedback?: string;
    };
    error?: string;
}
/**
 * Output frame for a resolved decision. Headless mode has no session log, so
 * this frame is its only durable record; TUI mode records an `approval` fact.
 */
export declare function encodeGateDecision(request: ApprovalRequest, decision: ApprovalDecision, error?: string): GateDecisionEvent;
export interface GateDecisionResult {
    decision: ApprovalDecision;
    error?: string;
}
/**
 * Accept only a well-formed decision for this exact request id and one of its
 * stable option ids. Malformed JSON, wrong ids, unknown options and missing
 * required input all fail closed.
 */
export declare function parseGateDecision(request: ApprovalRequest, line: string): GateDecisionResult;
