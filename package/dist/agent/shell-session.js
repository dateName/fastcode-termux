import { spawn } from "node:child_process";
import parse from "bash-parser";
import { terminateProcessTree } from "./process-tree.js";
import { normalizeTimeoutMs } from "./tools/validate.js";
const OUTPUT_LIMIT = 1024 * 1024;
const DEFAULT_BACKGROUND_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_SHELL_POOL_SIZE = 2;
export const MAX_SHELL_POOL_SIZE = 6;
let poolLimit = DEFAULT_SHELL_POOL_SIZE;
const jobs = new Map();
const pool = [];
let spawns = 0;
let spawnTurn = Number.NaN;
let spawnsThisTurn = 0;
class ShellJob {
    id;
    key;
    command;
    cwd;
    startedAt = Date.now();
    output = "";
    delivered = 0;
    status = "running";
    exitCode;
    nextPollMs = 1000;
    child;
    resident;
    donePromise;
    resolveDone;
    waiters = [];
    timeoutTimer;
    abortSignal;
    abortListener;
    cleaned = false;
    constructor(command, cwd) {
        this.id = "sh_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
        this.key = this.id.replace(/[^a-z0-9]/gi, "");
        this.command = command;
        this.cwd = cwd;
        this.donePromise = new Promise((resolve) => {
            this.resolveDone = resolve;
        });
    }
    done() {
        return this.donePromise;
    }
    append(text) {
        if (!text)
            return;
        this.output += text;
        if (this.output.length > OUTPUT_LIMIT) {
            const over = this.output.length - OUTPUT_LIMIT;
            this.output = this.output.slice(over);
            this.delivered = Math.max(0, this.delivered - over);
        }
        this.notify();
    }
    takeOutput() {
        const next = this.output.slice(this.delivered);
        this.delivered = this.output.length;
        return next;
    }
    finish(status, exitCode) {
        if (this.status !== "running")
            return;
        this.status = status;
        this.exitCode = exitCode;
        this.cleanupLifecycle();
        this.resolveDone();
        this.notify();
    }
    /**
     * Task-level timeout lives until the job actually finishes. Returning to
     * the foreground only detaches the AbortSignal; it must not disarm this.
     */
    armTimeout(ms) {
        if (this.timeoutTimer || this.status !== "running")
            return;
        this.timeoutTimer = setTimeout(() => this.kill("timeout"), ms);
        this.timeoutTimer.unref?.();
    }
    attachAbort(signal) {
        if (!signal || this.abortListener)
            return;
        const listener = () => this.kill("killed");
        this.abortSignal = signal;
        this.abortListener = listener;
        signal.addEventListener("abort", listener, { once: true });
    }
    /** Detach Esc/foreground cancellation but keep the timeout armed. */
    detachForeground() {
        if (this.abortSignal && this.abortListener)
            this.abortSignal.removeEventListener("abort", this.abortListener);
        this.abortSignal = undefined;
        this.abortListener = undefined;
    }
    cleanupLifecycle() {
        if (this.cleaned)
            return;
        this.cleaned = true;
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = undefined;
        }
        this.detachForeground();
    }
    waitForChange(ms) {
        if (this.status !== "running" || this.delivered < this.output.length)
            return Promise.resolve();
        if (ms <= 0)
            return Promise.resolve();
        return new Promise((resolve) => {
            let timer;
            const wake = () => {
                if (timer)
                    clearTimeout(timer);
                this.waiters = this.waiters.filter((entry) => entry !== wake);
                resolve();
            };
            this.waiters.push(wake);
            timer = setTimeout(wake, ms);
        });
    }
    notify() {
        const waiters = this.waiters;
        this.waiters = [];
        for (const waiter of waiters)
            waiter();
    }
    view() {
        return {
            id: this.id,
            command: this.command,
            cwd: this.cwd,
            status: this.status,
            exitCode: this.exitCode,
            bytes: this.output.length,
            startedAt: this.startedAt,
            pid: this.child?.pid ?? this.resident?.child.pid,
            timeoutArmed: Boolean(this.timeoutTimer),
            foregroundAttached: Boolean(this.abortListener),
        };
    }
    kill(reason) {
        if (this.status !== "running")
            return;
        this.append(reason === "timeout"
            ? "\n[command timed out: process group killed; setsid descendants may escape]"
            : "\n[command aborted: process group killed; setsid descendants may escape]");
        this.status = reason;
        this.cleanupLifecycle();
        if (this.resident)
            this.resident.kill();
        else if (this.child)
            terminateProcessTree(this.child);
        this.resolveDone();
        this.notify();
    }
}
class ResidentShell {
    child;
    job;
    dead = false;
    buffer = "";
    background = false;
    claimed = false;
    constructor(cwd) {
        const env = { ...process.env, FASTCODE_SANDBOX: "1", FASTCODE_SANDBOX_ROOT: cwd };
        this.child = spawn("sh", ["-s"], {
            cwd,
            env,
            detached: process.platform !== "win32",
            windowsHide: true,
        });
        this.child.stdout.setEncoding("utf8");
        this.child.stderr.setEncoding("utf8");
        this.child.stdout.on("data", (chunk) => this.consume(chunk));
        this.child.stderr.on("data", (chunk) => this.consume(chunk));
        this.child.on("error", (err) => {
            this.fail(err.message);
        });
        this.child.on("close", (code) => {
            this.dead = true;
            this.fail(`shell exited (${code ?? "unknown"})`, code);
            const index = pool.indexOf(this);
            if (index >= 0)
                pool.splice(index, 1);
        });
    }
    claimIfIdle() {
        if (this.dead || this.job || this.claimed)
            return false;
        this.claimed = true;
        return true;
    }
    run(job, timeoutMs, background = false) {
        this.claimed = false;
        this.job = job;
        this.background = background;
        this.buffer = "";
        job.resident = this;
        const marker = `__FC_END_${job.key}__`;
        const body = job.command.trim() ? ["(", job.command, ")"] : [":"];
        const script = [
            `if cd ${shellQuote(job.cwd)}; then`,
            ...body,
            "__fc_status=$?",
            "else",
            "__fc_status=1",
            "fi",
            `printf '\\n${marker}:%s\\n' "$__fc_status"`,
            "",
        ].join("\n");
        try {
            this.child.stdin.write(script);
        }
        catch (err) {
            job.append(err?.message ?? String(err));
            job.finish("failed", 1);
        }
        void timeoutMs;
    }
    consume(chunk) {
        if (this.dead)
            return;
        // Output that arrives while no job owns the shell belongs to an
        // already-finished background child. Never carry it into the next job.
        if (!this.job) {
            this.buffer = "";
            return;
        }
        this.buffer += chunk;
        const marker = `__FC_END_${this.job.key}__:`;
        const index = this.buffer.indexOf(marker);
        if (index < 0) {
            const sentinel = "\n" + marker;
            let keep = 0;
            const max = Math.min(this.buffer.length, sentinel.length);
            for (let length = max; length > 0; length -= 1) {
                if (sentinel.startsWith(this.buffer.slice(this.buffer.length - length))) {
                    keep = length;
                    break;
                }
            }
            const flush = this.buffer.length - keep;
            if (flush > 0) {
                this.job.append(this.buffer.slice(0, flush));
                this.buffer = this.buffer.slice(flush);
            }
            return;
        }
        const rest = this.buffer.slice(index + marker.length);
        const newline = rest.indexOf("\n");
        if (newline < 0)
            return;
        const job = this.job;
        job.append(this.buffer.slice(0, index));
        const code = Number(rest.slice(0, newline).trim());
        this.buffer = rest.slice(newline + 1);
        this.job = undefined;
        const background = this.background;
        this.background = false;
        job.finish(Number.isFinite(code) && code === 0 ? "done" : "failed", Number.isFinite(code) ? code : 1);
        // A background operator leaves a detached child writing into this
        // shell's stdout pipe. Retire the resident so late output cannot be
        // attributed to the next command.
        if (background)
            this.kill();
    }
    fail(message, code) {
        this.claimed = false;
        if (!this.job)
            return;
        const job = this.job;
        this.job = undefined;
        this.background = false;
        if (this.buffer) {
            job.append(this.buffer);
            this.buffer = "";
        }
        if (code === 0) {
            job.finish("done", 0);
            return;
        }
        job.append(`\n${message}`);
        job.finish("failed", code ?? 1);
    }
    kill() {
        this.dead = true;
        this.claimed = false;
        this.background = false;
        this.buffer = "";
        terminateProcessTree(this.child);
        const index = pool.indexOf(this);
        if (index >= 0)
            pool.splice(index, 1);
    }
}
export async function executeShellCommand(command, cwd, options = {}) {
    pruneJobs();
    if (options.signal?.aborted)
        return { ok: false, status: "killed", output: "command aborted before start" };
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const backgroundAfterMs = options.backgroundAfterMs ?? DEFAULT_BACKGROUND_MS;
    const shape = analyzeShellShape(command);
    const useResident = process.platform !== "win32" && !shape.oneShot;
    let job;
    if (useResident) {
        const resident = await acquireResident(options.turn, cwd, timeoutMs, options.signal);
        if (resident === "limit")
            return { ok: false, status: "failed", output: spawnLimitMessage() };
        if (resident === "timeout")
            return { ok: false, status: "timeout", output: "shell pool is busy; timed out waiting for a free resident shell" };
        if (resident === "killed")
            return { ok: false, status: "killed", output: "command aborted before start" };
        job = new ShellJob(command, cwd);
        resident.run(job, timeoutMs, shape.background);
    }
    else {
        if (!maySpawn(options.turn))
            return { ok: false, status: "failed", output: spawnLimitMessage() };
        job = startOneShot(command, cwd);
    }
    jobs.set(job.id, job);
    job.armTimeout(timeoutMs);
    job.attachAbort(options.signal);
    if (options.signal?.aborted)
        job.kill("killed");
    await Promise.race([job.done(), delay(backgroundAfterMs)]);
    if (job.status === "running") {
        // Task keeps running: only the foreground Esc/abort association is
        // released. The timeout stays armed until the job really finishes.
        job.detachForeground();
        return {
            ok: true,
            status: "running",
            output: job.takeOutput(),
            sessionId: job.id,
            nextPollMs: job.nextPollMs,
        };
    }
    return syncResult(job);
}
export async function pollShellSession(id, waitMs = 0) {
    pruneJobs();
    const job = jobs.get(id);
    if (!job)
        return undefined;
    return await pollOnce(job, waitMs);
}
async function pollOnce(job, waitMs) {
    await job.waitForChange(waitMs);
    const output = job.takeOutput();
    if (output)
        job.nextPollMs = 1000;
    else if (job.status === "running")
        job.nextPollMs = Math.min(30_000, job.nextPollMs * 2);
    return {
        ok: job.status === "done" || job.status === "running",
        status: job.status,
        output,
        exitCode: job.exitCode,
        sessionId: job.id,
        nextPollMs: job.nextPollMs,
    };
}
export function killShellSession(id) {
    const job = jobs.get(id);
    if (!job || job.status !== "running")
        return false;
    job.kill("killed");
    return true;
}
export function listShellSessions() {
    pruneJobs();
    return Array.from(jobs.values())
        .sort((a, b) => b.startedAt - a.startedAt)
        .map((job) => job.view());
}
export function shutdownShells() {
    for (const job of jobs.values()) {
        if (job.status === "running")
            job.kill("killed");
    }
    for (const resident of [...pool])
        resident.kill();
    pool.length = 0;
    jobs.clear();
}
/**
 * Exit-safe stop: send SIGTERM, wait briefly for close, then force SIGKILL.
 * Use this when the process is about to exit and must not leave children.
 */
export async function shutdownShellsAsync(graceMs = 400) {
    const running = Array.from(jobs.values()).filter((job) => job.status === "running");
    const residents = pool.filter((resident) => !resident.dead);
    for (const job of running)
        job.kill("killed");
    for (const resident of residents)
        resident.kill();
    pool.length = 0;
    jobs.clear();
    const children = [];
    for (const job of running) {
        if (job.child)
            children.push(job.child);
    }
    for (const resident of residents)
        children.push(resident.child);
    if (children.length === 0)
        return;
    await Promise.race([
        Promise.all(children.map((child) => waitForChildClose(child, graceMs))),
        delay(graceMs + 50),
    ]);
    for (const child of children) {
        if (child.exitCode === null && child.signalCode === null)
            terminateProcessTree(child, { graceMs: 0 });
    }
    await delay(50);
}
function waitForChildClose(child, ms) {
    if (child.exitCode !== null || child.signalCode !== null)
        return Promise.resolve();
    return new Promise((resolve) => {
        let timer;
        const done = () => {
            if (timer)
                clearTimeout(timer);
            child.removeListener("close", done);
            resolve();
        };
        timer = setTimeout(done, ms);
        child.once("close", done);
    });
}
export function shellPoolSize() {
    return poolLimit;
}
/** Clamp and apply the resident shell concurrency (1..6, default 2). */
export function setShellPoolSize(size) {
    const parsed = Number(size);
    poolLimit = Number.isFinite(parsed)
        ? Math.min(MAX_SHELL_POOL_SIZE, Math.max(1, Math.floor(parsed)))
        : DEFAULT_SHELL_POOL_SIZE;
    return poolLimit;
}
export function shellPoolStats() {
    return {
        spawns,
        active: Array.from(jobs.values()).filter((job) => job.status === "running").length,
        pool: pool.filter((resident) => !resident.dead).length,
        maxPool: poolLimit,
        maxSpawnPerTurn: maxSpawnPerTurn(),
    };
}
function startOneShot(command, cwd) {
    const job = new ShellJob(command, cwd);
    const child = spawn(command, {
        cwd,
        shell: true,
        env: { ...process.env, FASTCODE_SANDBOX: "1", FASTCODE_SANDBOX_ROOT: cwd },
        windowsHide: true,
        detached: process.platform !== "win32",
    });
    job.child = child;
    child.stdout?.on("data", (chunk) => job.append(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk) => job.append(chunk.toString("utf8")));
    child.on("error", (err) => {
        job.append("\n" + err.message);
        job.finish("failed", 1);
    });
    child.on("close", (code) => {
        if (job.status === "running")
            job.finish(code === 0 ? "done" : "failed", code);
    });
    return job;
}
async function acquireResident(turn, cwd, waitMs, signal) {
    const deadline = Date.now() + waitMs;
    while (true) {
        for (const resident of pool) {
            if (resident.claimIfIdle())
                return resident;
        }
        const live = pool.filter((resident) => !resident.dead);
        if (live.length < poolLimit && maySpawn(turn)) {
            const resident = new ResidentShell(cwd);
            resident.claimIfIdle();
            pool.push(resident);
            return resident;
        }
        // No free shell and no spawn budget: wait for a running command to
        // finish instead of failing the third call with "both shells busy".
        if (live.length === 0)
            return "limit";
        if (signal?.aborted)
            return "killed";
        const remaining = deadline - Date.now();
        if (remaining <= 0)
            return "timeout";
        await delay(Math.min(remaining, 50));
    }
}
const INTERACTIVE_COMMANDS = new Set(["vim", "nano", "less", "more", "ssh", "su", "login", "read", "top", "htop", "tmux", "screen"]);
const REPL_COMMANDS = new Set(["python", "python3", "node", "bash", "zsh", "fish", "irb", "sqlite3"]);
const WRAPPER_COMMANDS = new Set(["sudo", "env", "nohup", "command", "time", "exec"]);
function analyzeShellShape(command) {
    let ast;
    try {
        ast = parse(command, { mode: "bash" });
    }
    catch {
        // Fall back to the historical heuristic only when the parser cannot
        // classify the command at all.
        return {
            oneShot: /(^|\s)(vim|nano|less|more|ssh|su|login|read|top|htop|tmux|screen)(\s|$)/.test(command)
                || /(^|\s)(python|python3|node|bash|zsh|fish|irb|sqlite3)(\s|$)/.test(command) && !/\s-(c|e|m)\s/.test(command),
            background: /(^|[^&>])&([^&>]|$)/.test(command),
        };
    }
    let oneShot = false;
    let background = false;
    const walk = (node, depth = 0) => {
        if (!node || typeof node !== "object" || depth > 32)
            return;
        if (Array.isArray(node)) {
            for (const entry of node)
                walk(entry, depth + 1);
            return;
        }
        // bash-parser also marks `cmd &> file` as async; only retire the
        // resident for a real background operator, not a redirect.
        if (node.async === true && /(^|[^&>])&([^&>]|$)/.test(command))
            background = true;
        if (node.type === "Command" && typeof node.name?.text === "string") {
            const name = node.name.text;
            const args = Array.isArray(node.suffix)
                ? node.suffix.map((word) => typeof word?.text === "string" ? word.text : "").filter(Boolean)
                : [];
            const replOptions = (values) => values.some((arg) => /^(-c|-e|-m|-p|--eval|--print|--command)$/.test(arg));
            if (INTERACTIVE_COMMANDS.has(name) || REPL_COMMANDS.has(name) && !replOptions(args))
                oneShot = true;
            if (WRAPPER_COMMANDS.has(name)) {
                const wrappedIndex = args.findIndex((arg) => INTERACTIVE_COMMANDS.has(arg) || REPL_COMMANDS.has(arg));
                if (wrappedIndex >= 0) {
                    const wrappedName = args[wrappedIndex];
                    if (INTERACTIVE_COMMANDS.has(wrappedName) ||
                        REPL_COMMANDS.has(wrappedName) && !replOptions(args.slice(wrappedIndex + 1)))
                        oneShot = true;
                }
            }
        }
        for (const value of Object.values(node)) {
            if (value && typeof value === "object")
                walk(value, depth + 1);
        }
    };
    walk(ast);
    return { oneShot, background };
}
function maySpawn(turn) {
    const current = typeof turn === "number" ? turn : 0;
    if (current !== spawnTurn) {
        spawnTurn = current;
        spawnsThisTurn = 0;
    }
    if (spawnsThisTurn >= maxSpawnPerTurn())
        return false;
    spawnsThisTurn += 1;
    spawns += 1;
    return true;
}
function maxSpawnPerTurn() {
    const raw = Number(process.env["FASTCODE_MAX_SPAWN_PER_TURN"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8;
}
function spawnLimitMessage() {
    return `spawn limit reached (FASTCODE_MAX_SPAWN_PER_TURN=${maxSpawnPerTurn()}); batch commands or poll an existing session`;
}
function syncResult(job) {
    return {
        ok: job.status === "done",
        status: job.status,
        output: job.takeOutput(),
        exitCode: job.exitCode,
        sessionId: job.id,
        nextPollMs: job.nextPollMs,
    };
}
function pruneJobs() {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (job.status !== "running" && now - job.startedAt > 10 * 60 * 1000)
            jobs.delete(id);
    }
    if (jobs.size > 50) {
        const finished = Array.from(jobs.values())
            .filter((job) => job.status !== "running")
            .sort((a, b) => a.startedAt - b.startedAt);
        for (const job of finished.slice(0, jobs.size - 50))
            jobs.delete(job.id);
    }
}
function shellQuote(value) {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
