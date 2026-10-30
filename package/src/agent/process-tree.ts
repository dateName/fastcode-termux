import { spawn, type ChildProcess } from "node:child_process";

export const KILL_GRACE_MS = 1000;

const pendingKills = new WeakMap<ChildProcess, ReturnType<typeof setTimeout>>();

export interface TerminateOptions {
    /** Milliseconds to wait after SIGTERM before escalating to SIGKILL. */
    graceMs?: number;
}

function sendSignal(pid: number, signal: NodeJS.Signals): "sent" | "gone" {
    try {
        process.kill(-pid, signal);
        return "sent";
    }
    catch (err: any) {
        if (err?.code !== "ESRCH")
            return "sent";
        try {
            process.kill(pid, signal);
            return "sent";
        }
        catch (err2: any) {
            return err2?.code === "ESRCH" ? "gone" : "sent";
        }
    }
}

function isAlive(pid: number): boolean {
    try {
        process.kill(-pid, 0);
        return true;
    }
    catch (err: any) {
        if (err?.code !== "ESRCH")
            return true;
        try {
            process.kill(pid, 0);
            return true;
        }
        catch (err2: any) {
            return err2?.code !== "ESRCH";
        }
    }
}

function clearPending(child: ChildProcess): void {
    const timer = pendingKills.get(child);
    if (timer) {
        clearTimeout(timer);
        pendingKills.delete(child);
    }
}

/**
 * Send a single signal to the process group (falling back to the pid).
 * Kept for callers that need one-shot signalling; shell sessions should use
 * terminateProcessTree so SIGKILL escalation is always available.
 */
export function killProcessTree(child: ChildProcess | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
    if (!child || typeof child.pid !== "number")
        return;
    if (process.platform === "win32") {
        try {
            const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
            killer.unref();
        }
        catch {
            try {
                child.kill();
            }
            catch {
                // The process may already be gone.
            }
        }
        return;
    }
    sendSignal(child.pid, signal);
}

/**
 * Terminate a spawned process group with a SIGTERM -> grace -> SIGKILL flow.
 *
 * Boundary: this only guarantees the spawned process group is killed. A
 * descendant that calls setsid() leaves the group and may escape; we do not
 * scan for ppid=1 processes because that risks killing unrelated background
 * jobs on Termux. Callers should report
 * "process group killed; setsid descendants may escape".
 */
export function terminateProcessTree(child: ChildProcess | undefined, options: TerminateOptions = {}): void {
    if (!child || typeof child.pid !== "number")
        return;
    if (process.platform === "win32") {
        killProcessTree(child, "SIGTERM");
        return;
    }
    const pid = child.pid;
    clearPending(child);
    if (sendSignal(pid, "SIGTERM") === "gone")
        return;
    const graceMs = Math.max(0, Math.floor(options.graceMs ?? KILL_GRACE_MS));
    const timer = setTimeout(() => {
        pendingKills.delete(child);
        if (child.exitCode !== null || child.signalCode !== null)
            return;
        if (!isAlive(pid))
            return;
        sendSignal(pid, "SIGKILL");
    }, graceMs);
    timer.unref?.();
    pendingKills.set(child, timer);
    child.once("exit", () => clearPending(child));
}
