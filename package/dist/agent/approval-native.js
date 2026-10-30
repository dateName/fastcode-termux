/**
 * Termux:API approval sheet.
 *
 * Returns undefined when termux-dialog is missing/times out/crashes so the
 * caller can fall back to the TUI. A real cancellation returns a deny.
 * The command is built with spawn args (no shell interpolation).
 */
import { spawn } from "node:child_process";
import { decisionForOption } from "./approval.js";
export function nativeDecisionFromPayload(request, payload) {
    if (payload?.code === -1)
        return { kind: "deny", reason: "termux-dialog cancelled" };
    if (payload?.code !== 0 || !Number.isInteger(payload.index) ||
        payload.index < 0 || payload.index >= request.options.length)
        return { kind: "deny", reason: "termux-dialog returned an invalid selection" };
    return decisionForOption(request.options[payload.index]);
}
export async function nativeApproval(request, signal) {
    if (signal?.aborted)
        return { kind: "deny", reason: "approval cancelled" };
    const labels = request.options.map((option) => option.label);
    const title = request.prompt ?? `Approval: ${request.tool}`;
    return await new Promise((resolve) => {
        let settled = false;
        let child;
        let timer;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(value);
        };
        const onAbort = () => {
            try {
                child?.kill("SIGKILL");
            }
            catch {
                // Already gone.
            }
            finish({ kind: "deny", reason: "approval cancelled" });
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        child = spawn("termux-dialog", ["sheet", "-v", labels.join(","), "-t", title], {
            stdio: ["ignore", "pipe", "ignore"],
            windowsHide: true,
        });
        let stdout = "";
        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk) => {
            stdout += chunk;
        });
        child.on("error", () => finish(undefined));
        child.on("close", () => {
            let payload;
            try {
                payload = JSON.parse(stdout.trim());
            }
            catch {
                finish(undefined);
                return;
            }
            finish(nativeDecisionFromPayload(request, payload));
        });
        timer = setTimeout(() => {
            try {
                child?.kill("SIGKILL");
            }
            catch {
                // Already gone.
            }
            finish(undefined);
        }, Math.max(1000, request.timeoutMs ?? 60_000));
        timer.unref?.();
    });
}
