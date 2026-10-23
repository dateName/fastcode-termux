import { executeShellCommand, pollShellSession } from "../shell-session.js";
import { invalid, numberOption } from "./validate.js";
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
            timeoutMs: numberOption(call.timeoutMs, 120000),
        });
        return formatExec(result);
    },
};
function formatExec(result) {
    if (result.status !== "running")
        return { ok: result.ok, output: result.output || `[command ${result.status}]` };
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
