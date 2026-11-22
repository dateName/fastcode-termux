export type StateScope = "call" | "turn" | "session";
export type RevalidateKey = "trust" | "sandboxRoots" | "schema" | "modelCaps";
export type ToolErrorCode = "ENOENT" | "EACCES" | "EEXIST" | "ENOTDIR" | "EISDIR" | "EXDEV" | "INVALID_ARGS" | "SANDBOX_DENY" | "APPROVAL_DENY" | "EGRESS_DENY" | "NOT_FOUND" | "ABORTED" | "UNKNOWN";
export interface SideEffects {
    touched?: string[];
    created?: string[];
    removed?: string[];
}
export interface EgressAudit {
    outlet: string;
    target?: string;
    rule: string;
    mode: "audit" | "block";
    wouldBlock: boolean;
    code: "EGRESS_DENY";
    reason: string;
}
import type { ApprovalResolver } from "../approval.js";
import type { StructuredDiff } from "../../lib/values.js";
export interface ToolCall {
    tool: string;
    [key: string]: any;
}
export interface ToolCheckResult {
    ok: boolean;
    output: string;
    timedOut: boolean;
    exitCode?: number | null;
    files: string[];
}
export interface ToolResult {
    ok: boolean;
    output: string;
    code?: ToolErrorCode;
    hint?: string;
    truncated?: boolean;
    totalLines?: number;
    returnedLines?: number;
    totalBytes?: number;
    returnedBytes?: number;
    filesRead?: number;
    filesSkipped?: number;
    matches?: number;
    oldText?: string;
    newText?: string;
    changedStartLine?: number;
    oldLineCount?: number;
    newLineCount?: number;
    diffTruncated?: boolean;
    diffs?: Array<StructuredDiff & {
        path: string;
    }>;
    atomic?: boolean;
    check?: ToolCheckResult;
    egress?: EgressAudit;
    sideEffects?: SideEffects;
}
export interface ToolCtx {
    cwd: string;
    signal?: AbortSignal;
    turn?: number;
    requestApproval?: ApprovalResolver;
    catalogHash?: string;
}
export type Prepared = {
    ok: true;
} | {
    ok: false;
    output: string;
    code?: ToolErrorCode;
    hint?: string;
};
export interface ApprovalHints {
    mayRequireApproval: boolean;
}
export interface Tool {
    name: string;
    requiresTrust?: boolean;
    stateScope: StateScope;
    revalidate?: RevalidateKey[];
    approvalHints?: ApprovalHints;
    prepare(call: ToolCall, ctx: ToolCtx): Prepared;
    execute(call: ToolCall, ctx: ToolCtx): Promise<ToolResult>;
}
