export type ApprovalScope = "once" | "session" | "always";
export type ApprovalReason = "trust" | "sensitive_path" | "ambiguous_match" | "destructive" | "large_diff";
export interface ChoiceItem {
    label: string;
    value: string;
}
export type ApprovalPreview = {
    kind: "diff";
    text: string;
} | {
    kind: "choices";
    items: ChoiceItem[];
};
export type ApprovalOption = {
    kind: "allow";
    id?: string;
    scope: ApprovalScope;
    label: string;
} | {
    kind: "deny";
    id?: string;
    label: string;
} | {
    kind: "choose";
    id?: string;
    label: string;
    value: string;
    meta?: {
        recommended?: boolean;
        risk?: string;
        files?: number;
        reason?: string;
    };
} | {
    kind: "feedback";
    id?: string;
    label: string;
    prompt: string;
};
export interface ApprovalRequest {
    id: string;
    tool: string;
    args: unknown;
    reason: ApprovalReason;
    options: ApprovalOption[];
    preview?: ApprovalPreview;
    tier?: 0 | 1 | 2 | 3;
    prompt?: string;
    source?: "system" | "ai" | "free";
    defaultIndex?: number;
    timeoutMs?: number;
    freeInput?: {
        enabled: true;
        prompt: string;
        hint?: string;
    };
}
export type ApprovalDecision = {
    kind: "allow";
    scope: ApprovalScope;
} | {
    kind: "deny";
    reason?: string;
    feedback?: string;
    code?: string;
    target?: string;
} | {
    kind: "pending";
    request: ApprovalRequest;
} | {
    kind: "choose";
    value: string;
    input?: string;
} | {
    kind: "feedback";
    text: string;
};
export type ApprovalResolver = (request: ApprovalRequest) => ApprovalDecision | Promise<ApprovalDecision>;
export declare const DEFAULT_ALLOW_OPTIONS: ApprovalOption[];
export declare function approvalRequestId(): string;
export declare function approvalOptionForDecision(request: ApprovalRequest, decision: ApprovalDecision): ApprovalOption | undefined;
export declare function parseApprovalChoice(request: ApprovalRequest, text: string): ApprovalOption | undefined;
export declare function decisionForOption(option: ApprovalOption): ApprovalDecision;
