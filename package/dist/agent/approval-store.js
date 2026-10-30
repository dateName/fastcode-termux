import { toolCallFingerprint } from "./guards.js";
import { isToolApproved, rememberToolApproval } from "../config/trust.js";
const sessionApprovals = new Set();
export function approvalKey(tool, call, cwd) {
    return `${tool}:${toolCallFingerprint(call, cwd)}`;
}
export function isPreApproved(key, catalogHash) {
    return sessionApprovals.has(`${catalogHash}:${key}`) || isToolApproved(key, catalogHash);
}
export function rememberApproval(key, catalogHash, scope) {
    if (scope === "once")
        return;
    if (scope === "session") {
        sessionApprovals.add(`${catalogHash}:${key}`);
        return;
    }
    rememberToolApproval(key, catalogHash);
}
export function clearSessionApprovals() {
    sessionApprovals.clear();
}
