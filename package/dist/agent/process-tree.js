import { spawn } from "node:child_process";
export function killProcessTree(child, signal = "SIGTERM") {
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
    try {
        process.kill(-child.pid, signal);
    }
    catch {
        try {
            child.kill(signal);
        }
        catch {
            // Same as above.
        }
    }
}
