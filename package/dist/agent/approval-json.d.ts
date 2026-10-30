/**
 * Stable NDJSON gate protocol for GUI/JSON clients.
 *
 * This module is pure: it validates and encodes one request/decision at a
 * time. A headless transport can consume it without leaking TUI output to
 * stdout. Hard Block requests never reach this code.
 */
import type { ApprovalDecision, ApprovalRequest } from "./approval.js";
export declare const GATE_PROTOCOL_VERSION = 1;
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
    diffstat: {
        files: number;
        lines: number;
    };
    options: Array<{
        id: string;
        label: string;
        kind: string;
        default?: boolean;
    }>;
    default: string;
    require_input?: string;
}
export declare function encodeGateAsk(request: ApprovalRequest): GateAskEvent;
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
