import { executeShellCommand, pollShellSession } from "../shell-session.js";
import { invalid, normalizeTimeoutMs, numberOption } from "./validate.js";
export const shellTool = {
    name: "shell",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    approvalHints: { mayRequireApproval: true },
    prepare(call) {
        if (typeof call.session_id === "string" && call.session_id.trim())
            return { ok: true };
        if (typeof call.command !== "string" || call.command.trim() === "")
            return invalid("command must be a non-empty string");
        // Never silently ignore a requested cwd: the shell is rooted at the
        // session directory and moving it would bypass the trust boundary.
        if (call.cwd !== undefined && call.cwd !== null && String(call.cwd).trim() !== "")
            return invalid("cwd is not supported; shell runs in the session working directory");
        return { ok: true };
    },
    async execute(call, ctx) {
        if (typeof call.session_id === "string" && call.session_id.trim()) {
            const polled = await pollShellSession(call.session_id, numberOption(call.waitMs, 0));
            if (!polled)
                return { ok: false, output: `unknown shell session: ${call.session_id}` };
            return formatPoll(call.session_id, polled);
        }
        const result = await executeShellCommand(call.command, ctx.cwd, {
            signal: ctx.signal,
            turn: ctx.turn,
            timeoutMs: normalizeTimeoutMs(call.timeoutMs),
        });
        return formatExec(result);
    },
};
function formatExec(result) {
    if (result.status !== "running") {
        const status = `${result.status}${result.exitCode !== undefined && result.exitCode !== null ? ` (exit ${result.exitCode})` : ""}`;
        const body = result.output && result.output.trim() ? result.output.trimEnd() : "";
        return { ok: result.ok, output: body ? `${body}\n[${status}]` : `[${status}]` };
    }
    const header = `[session ${result.sessionId}] running`;
    const body = result.output ? "\n" + result.output : "";
    return {
        ok: true,
        output: `${header}${body}\n\nPoll with: {"tool":"shell","session_id":"${result.sessionId}"}`,
    };
}
function formatPoll(id, result) {
    const status = result.status === "running"
        ? `running (next poll ~${Math.round((result.nextPollMs ?? 1000) / 1000)}s)`
        : `${result.status}${result.exitCode !== undefined && result.exitCode !== null ? ` (exit ${result.exitCode})` : ""}`;
    const header = `[session ${id}] ${status}`;
    const body = result.output ? "\n" + result.output : result.status === "running" ? "\n(no new output)" : "";
    return { ok: result.ok, output: header + body };
}
