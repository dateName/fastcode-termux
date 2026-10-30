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
export declare function approvalKey(tool: string, call: ToolCall, cwd: string): string;
export declare function isPreApproved(key: string, catalogHash: string): boolean;
export declare function rememberApproval(key: string, catalogHash: string, scope: ApprovalScope): void;
export declare function clearSessionApprovals(): void;
