import { assertNever } from "../lib/values.js";
/**
 * Exhaustive table: adding a new AgentErrorKind is a compile error here until
 * it gets a public code/category/retryable policy.
 */
const ERROR_KIND_META = {
    token_budget: { code: "TOKEN_BUDGET", category: "config", retryable: false },
    cost_budget: { code: "COST_BUDGET", category: "config", retryable: false },
    loop_detected: { code: "LOOP_DETECTED", category: "agent", retryable: false },
    aborted: { code: "ABORTED", category: "cancelled", retryable: false },
    stream_error: { code: "STREAM_ERROR", category: "network", retryable: true },
    protocol_error: { code: "PROTOCOL_ERROR", category: "agent", retryable: true },
    incomplete: { code: "INCOMPLETE", category: "network", retryable: true },
};
export function taskStatusForStopReason(reason) {
    switch (reason) {
        case "complete":
            return "completed";
        case "aborted":
            return "stopped";
        case "max_turns":
        case "token_budget":
        case "cost_budget":
        case "loop_detected":
        case "stream_error":
        case "incomplete":
        case "protocol_error":
            return "failed";
        default:
            return assertNever(reason, "AgentStopReason");
    }
}
export function runErrorForErrorKind(kind, message) {
    const meta = ERROR_KIND_META[kind];
    return {
        code: meta.code,
        category: meta.category,
        retryable: meta.retryable,
        message,
    };
}
/**
 * Run-level error for a terminal stop reason.
 * "complete" and "aborted" produce no error: aborted is a user stop
 * (`status: "stopped"`), not a failure.
 */
export function runErrorForStopReason(reason, message = "") {
    switch (reason) {
        case "complete":
        case "aborted":
            return null;
        case "max_turns":
            return {
                code: "MAX_TURNS",
                category: "agent",
                retryable: false,
                message: message || "Maximum agent turns reached.",
            };
        case "token_budget":
        case "cost_budget":
        case "loop_detected":
        case "stream_error":
        case "incomplete":
        case "protocol_error":
            return runErrorForErrorKind(reason, message);
        default:
            return assertNever(reason, "AgentStopReason");
    }
}
