import { type ApprovalDecision, type ApprovalRequest } from "./approval.js";
export declare function nativeDecisionFromPayload(request: ApprovalRequest, payload: any): ApprovalDecision | undefined;
export declare function nativeApproval(request: ApprovalRequest, signal?: AbortSignal, options?: {
    diffPreview?: boolean;
}): Promise<ApprovalDecision | undefined>;
