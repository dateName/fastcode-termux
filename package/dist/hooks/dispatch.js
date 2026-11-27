/**
 * H1 hook dispatch (H1a-1: runTask only).
 *
 * Lazy host: no hooks directory / no *.mjs / enableHooks=false => no spawn.
 * The host is a child process speaking NDJSON over stdio; hook stdout is
 * redirected to the host's stderr. Host start/crash/timeout never fails the run.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { getPaths } from "../config/paths.js";
import { buildChildEnv } from "../lib/child-env.js";
import { HOOK_TIMEOUT_HARD, HOOK_TIMEOUT_SOFT } from "./hook-host.js";
let activeHost;
const TRUTHY = new Set(["1", "true", "yes", "on"]);
/** CLI opt-in: FASTCODE_HOOKS defaults to off. */
export function hooksEnabledFromEnv() {
    return TRUTHY.has((process.env["FASTCODE_HOOKS"] ?? "").trim().toLowerCase());
}
/** Map the three observable AgentEvents to hook names. Pure, no I/O. */
export function hookEventFor(event) {
    switch (event.type) {
        case "tool_call":
            return { name: "on-tool-call", event };
        case "tool_result":
            return { name: "on-tool-result", event };
        case "done":
            return { name: "on-run-complete", event };
        default:
            return undefined;
    }
}
function stderr(message) {
    process.stderr.write(`[fastcode] hooks: ${message}\n`);
}
function settleAll(host, reason) {
    for (const [id, pending] of host.pending) {
        clearTimeout(pending.timer);
        host.pending.delete(id);
        pending.resolve();
    }
    host.closed = true;
    if (activeHost === host)
        activeHost = undefined;
    process.removeListener("exit", host.exitHandler);
    stderr(reason);
}
function killHost(host, reason) {
    if (host.closed)
        return;
    stderr(`SIGKILL host pid=${host.child.pid ?? "?"} reason=${reason}`);
    try {
        host.child.kill("SIGKILL");
    }
    catch {
        // best effort
    }
    settleAll(host, reason);
}
/**
 * Start the hook host for one run. Never throws: a host failure is logged
 * and hooks are skipped for the rest of the run.
 */
export async function startHookHost(options) {
    if (!options.enabled) {
        await shutdownHookHost();
        return;
    }
    const hooksDir = getPaths().hooks;
    let files = [];
    try {
        files = (await readdir(hooksDir)).filter((file) => file.endsWith(".mjs")).sort();
    }
    catch {
        files = []; // lazy: no hooks dir
    }
    if (files.length === 0) {
        await shutdownHookHost();
        return;
    }
    const parts = [];
    for (const file of files) {
        try {
            const info = await stat(join(hooksDir, file));
            parts.push(`${file}:${info.mtimeMs}:${info.size}`);
        }
        catch {
            parts.push(`${file}:missing`);
        }
    }
    const signature = parts.join("|");
    if (activeHost) {
        if (activeHost.signature === signature)
            return;
        await stopHookHost();
    }
    const here = fileURLToPath(new URL(".", import.meta.url));
    const runner = [
        join(here, "hook-host-runner.js"),
        join(here, "hooks", "hook-host-runner.js"),
    ].find((candidate) => existsSync(candidate));
    if (!runner) {
        stderr("host runner not built; skipping hooks");
        return;
    }
    let child;
    try {
        child = spawn(process.execPath, [runner, hooksDir, String(HOOK_TIMEOUT_SOFT)], {
            env: buildChildEnv(),
            stdio: ["pipe", "pipe", "pipe"],
        });
    }
    catch (error) {
        stderr(`host start failed: ${String(error?.message ?? error)}`);
        return;
    }
    const host = {
        child,
        pending: new Map(),
        inflight: new Set(),
        nextId: 1,
        closed: false,
        signature,
        exitHandler: () => { },
    };
    child.stdin?.on("error", () => { });
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    if (child.stdout) {
        const rl = readline.createInterface({ input: child.stdout });
        rl.on("line", (line) => {
            let frame;
            try {
                frame = JSON.parse(line);
            }
            catch {
                return;
            }
            if (frame.type === "load_error") {
                stderr(`failed to load ${frame.file}: ${frame.error}`);
                return;
            }
            if (frame.type !== "result" || typeof frame.id !== "number")
                return;
            const pending = host.pending.get(frame.id);
            if (!pending)
                return;
            clearTimeout(pending.timer);
            host.pending.delete(frame.id);
            pending.resolve();
        });
    }
    const started = await new Promise((resolve) => {
        child.once("spawn", () => resolve(true));
        child.once("error", (error) => {
            stderr(`host start failed: ${error.message}`);
            resolve(false);
        });
    });
    if (!started) {
        host.closed = true;
        return;
    }
    child.once("exit", () => {
        if (host.closed)
            return;
        settleAll(host, "host exited; hooks skipped for the rest of this run");
    });
    host.exitHandler = () => {
        try {
            child.kill("SIGKILL");
        }
        catch {
            // best effort
        }
    };
    process.once("exit", host.exitHandler);
    activeHost = host;
}
function sendAndWait(host, id, event, ctx) {
    return new Promise((resolve) => {
        const finish = () => {
            const pending = host.pending.get(id);
            if (pending) {
                clearTimeout(pending.timer);
                host.pending.delete(id);
            }
            resolve();
        };
        const timer = setTimeout(() => {
            if (!host.pending.has(id))
                return;
            host.pending.delete(id);
            resolve();
            killHost(host, `hard timeout (${HOOK_TIMEOUT_HARD}ms); hooks skipped`);
        }, HOOK_TIMEOUT_HARD);
        host.pending.set(id, { timer, resolve: finish });
        try {
            host.child.stdin?.write(JSON.stringify({ type: "event", id, event, ctx }) + "\n", (error) => {
                if (error)
                    finish();
            });
        }
        catch {
            finish();
        }
    });
}
export async function dispatchHook(event, ctx = {}) {
    const host = activeHost;
    if (!host || host.closed)
        return;
    const id = host.nextId++;
    const pending = sendAndWait(host, id, event, ctx);
    host.inflight.add(pending);
    pending.finally(() => host.inflight.delete(pending));
}
/**
 * Wait for pending hooks. By default also stop the host; the TUI keeps it
 * warm between prompts and calls shutdownHookHost() on exit.
 * Never throws.
 */
export async function stopHookHost(options = {}) {
    const host = activeHost;
    if (!host)
        return;
    if (host.inflight.size > 0) {
        let timer;
        try {
            await Promise.race([
                Promise.allSettled([...host.inflight]),
                new Promise((resolve) => {
                    timer = setTimeout(resolve, HOOK_TIMEOUT_HARD + 500);
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    if (host.pending.size > 0)
        killHost(host, `hard timeout on shutdown (${HOOK_TIMEOUT_HARD}ms); hooks skipped`);
    if (options.shutdown === false)
        return;
    if (!host.closed) {
        host.closed = true;
        try {
            host.child.stdin?.write(JSON.stringify({ type: "exit" }) + "\n");
        }
        catch {
            // best effort
        }
        try {
            host.child.stdin?.end();
        }
        catch {
            // best effort
        }
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 500);
            host.child.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
    process.removeListener("exit", host.exitHandler);
    activeHost = undefined;
}
/** Kill a warm host at process/TUI exit. Never throws. */
export async function shutdownHookHost() {
    await stopHookHost({ shutdown: true });
}
