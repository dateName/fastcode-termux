import { spawn } from "node:child_process";
import { redactSecrets } from "../lib/child-env.js";
import { terminateProcessTree } from "./process-tree.js";
const OUTPUT_LIMIT = 8 * 1024;
/**
 * Run a user-configured post-write check. The command is static config, never
 * model output; changed files are passed through FASTCODE_CHECK_FILES. A failed
 * or timed-out check is reported but never changes the tool's own ok flag.
 */
export async function runCheckCommand(command, cwd, files, timeoutMs = 15_000) {
    if (!command.trim() || files.length === 0)
        return undefined;
    return await new Promise((resolve) => {
        let output = "";
        let settled = false;
        let timedOut = false;
        let timer;
        let settleTimer;
        const child = spawn(command, {
            cwd,
            shell: true,
            windowsHide: true,
            detached: process.platform !== "win32",
            env: {
                ...process.env,
                FASTCODE_CHECK_FILES: files.join("\n"),
                FASTCODE_CHECK_MODE: "post-write",
            },
        });
        const append = (chunk) => {
            output += chunk.toString();
            if (output.length > OUTPUT_LIMIT)
                output = output.slice(output.length - OUTPUT_LIMIT);
        };
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (settleTimer)
                clearTimeout(settleTimer);
            child.stdout?.removeAllListeners();
            child.stderr?.removeAllListeners();
            resolve(result);
        };
        timer = setTimeout(() => {
            timedOut = true;
            terminateProcessTree(child, { graceMs: 250 });
            // Let the close event settle the child; the fallback only covers a
            // kill that did not report back.
            settleTimer = setTimeout(() => finish({
                ok: false,
                output: redactSecrets(output).trim() || `check timed out after ${timeoutMs}ms`,
                timedOut: true,
                exitCode: null,
                files,
            }), 1000);
            settleTimer.unref?.();
        }, Math.max(1000, timeoutMs));
        timer.unref?.();
        child.stdout?.on("data", append);
        child.stderr?.on("data", append);
        child.on("error", (err) => finish({
            ok: false,
            output: redactSecrets(err.message),
            timedOut: false,
            exitCode: null,
            files,
        }));
        child.on("close", (code) => finish({
            ok: code === 0 && !timedOut,
            output: redactSecrets(output).trim(),
            timedOut,
            exitCode: code,
            files,
        }));
    });
}
