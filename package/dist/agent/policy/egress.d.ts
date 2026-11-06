import type { EgressAudit, ToolCall } from "../tools/types.js";
import { type EgressConfig, type EgressMode } from "./defaults.js";
export type { EgressConfig, EgressMode } from "./defaults.js";
export { DEFAULT_CONTENT_MARKERS, DEFAULT_EGRESS_CONFIG } from "./defaults.js";
export type EgressAction = "read" | "write" | "delete" | "egress" | "payload";
export interface EgressSubject {
    outlet: string;
    action: EgressAction;
    target?: string;
    payload?: string;
    outbound?: boolean;
}
export interface EgressDecision {
    outlet: string;
    target?: string;
    rule: string;
    mode: EgressMode;
    wouldBlock: boolean;
    code: "EGRESS_DENY";
    reason: string;
}
export interface EgressEvaluation {
    action: "allow" | "audit" | "deny";
    decision?: EgressDecision;
}
export declare function normalizeEgressConfig(raw: any): EgressConfig;
export declare function egressSubjects(call: ToolCall): EgressSubject[];
export declare function evaluateEgressCall(call: ToolCall, cwd: string, config: EgressConfig): EgressEvaluation;
export declare function evaluateEgressOutput(tool: string, output: string, config: EgressConfig): EgressEvaluation;
export declare function egressAudit(decision: EgressDecision): EgressAudit;
export declare function formatEgressDenial(decision: EgressDecision): string;
export declare function formatEgressAudit(audit: EgressAudit): string;
