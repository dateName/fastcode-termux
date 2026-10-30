/**
 * Approval scope storage.
 *
 * - once: no persistence
 * - session: in-memory, implicitly cleared when the process exits
 * - always: ~/.fastcode/trusted.json `tools` entry bound to catalogHash
 *
 * Keys include the normalized tool-call fingerprint so "always" cannot grant
 * every future shell command from one approval.
 */
import type { ApprovalScope } from "./approval.js";
import type { ToolCall } from "./tools/types.js";
import { toolCallFingerprint } from "./guards.js";
import { isToolApproved, rememberToolApproval } from "../config/trust.js";

const sessionApprovals = new Set<string>();

export function approvalKey(tool: string, call: ToolCall, cwd: string): string {
    return `${tool}:${toolCallFingerprint(call, cwd)}`;
}

export function isPreApproved(key: string, catalogHash: string): boolean {
    return sessionApprovals.has(`${catalogHash}:${key}`) || isToolApproved(key, catalogHash);
}

export function rememberApproval(key: string, catalogHash: string, scope: ApprovalScope): void {
    if (scope === "once")
        return;
    if (scope === "session") {
        sessionApprovals.add(`${catalogHash}:${key}`);
        return;
    }
    rememberToolApproval(key, catalogHash);
}

export function clearSessionApprovals(): void {
    sessionApprovals.clear();
}
