import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { killProcessTree } from "./process-tree.js";

export type ShellJobStatus = "running" | "done" | "failed" | "killed" | "timeout";

export interface ShellExecResult {
    ok: boolean;
    status: ShellJobStatus;
    output: string;
    exitCode?: number | null;
    sessionId?: string;
    nextPollMs?: number;
}

export interface ShellJobView {
    id: string;
    command: string;
    cwd: string;
    status: ShellJobStatus;
    exitCode?: number | null;
    bytes: number;
    startedAt: number;
    pid?: number;
}

interface ExecOptions {
    signal?: AbortSignal;
    turn?: number;
    timeoutMs?: number;
    backgroundAfterMs?: number;
}

const OUTPUT_LIMIT = 1024 * 1024;
const DEFAULT_BACKGROUND_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_POOL = 2;
const jobs = new Map<string, ShellJob>();
const pool: ResidentShell[] = [];
let spawns = 0;
let spawnTurn = Number.NaN;
let spawnsThisTurn = 0;

class ShellJob {
    readonly id: string;
    readonly key: string;
    readonly command: string;
    readonly cwd: string;
    readonly startedAt = Date.now();
    output = "";
    delivered = 0;
    status: ShellJobStatus = "running";
    exitCode: number | null | undefined;
    nextPollMs = 1000;
    child?: ChildProcess;
    resident?: ResidentShell;
    private readonly donePromise: Promise<void>;
    private resolveDone!: () => void;
    private waiters: Array<() => void> = [];
    constructor(command: string, cwd: string) {
        this.id = "sh_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
        this.key = this.id.replace(/[^a-z0-9]/gi, "");
        this.command = command;
        this.cwd = cwd;
        this.donePromise = new Promise((resolve) => {
            this.resolveDone = resolve;
        });
    }
    done(): Promise<void> {
        return this.donePromise;
    }
    append(text: string): void {
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
    takeOutput(): string {
        const next = this.output.slice(this.delivered);
        this.delivered = this.output.length;
        return next;
    }
    finish(status: ShellJobStatus, exitCode?: number | null): void {
        if (this.status !== "running")
            return;
        this.status = status;
        this.exitCode = exitCode;
        this.resolveDone();
        this.notify();
    }
    waitForChange(ms: number): Promise<void> {
        if (this.status !== "running" || this.delivered < this.output.length)
            return Promise.resolve();
        if (ms <= 0)
            return Promise.resolve();
        return new Promise((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
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
    notify(): void {
        const waiters = this.waiters;
        this.waiters = [];
        for (const waiter of waiters)
            waiter();
    }
    view(): ShellJobView {
        return {
            id: this.id,
            command: this.command,
            cwd: this.cwd,
            status: this.status,
            exitCode: this.exitCode,
            bytes: this.output.length,
            startedAt: this.startedAt,
            pid: this.child?.pid,
        };
    }
    kill(reason: "killed" | "timeout"): void {
        if (this.status !== "running")
            return;
        this.append(reason === "timeout" ? "\n[command timed out: process tree killed]" : "\n[command aborted: process tree killed]");
        this.status = reason;
        if (this.resident)
            this.resident.kill();
        else if (this.child)
            killProcessTree(this.child, "SIGTERM");
        this.resolveDone();
        this.notify();
    }
}

class ResidentShell {
    readonly child: ChildProcessWithoutNullStreams;
    job?: ShellJob;
    dead = false;
    private buffer = "";
    constructor(cwd: string) {
        const env = { ...process.env, FASTCODE_SANDBOX: "1", FASTCODE_SANDBOX_ROOT: cwd };
        this.child = spawn("sh", ["-s"], {
            cwd,
            env,
            detached: process.platform !== "win32",
            windowsHide: true,
        });
        this.child.stdout.setEncoding("utf8");
        this.child.stderr.setEncoding("utf8");
        this.child.stdout.on("data", (chunk: string) => this.consume(chunk));
        this.child.stderr.on("data", (chunk: string) => this.consume(chunk));
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
    run(job: ShellJob, timeoutMs: number): void {
        this.job = job;
        job.resident = this;
        const marker = `__FC_END_${job.key}__`;
        const script = [
            `if cd ${shellQuote(job.cwd)}; then`,
            job.command,
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
        catch (err: any) {
            job.append(err?.message ?? String(err));
            job.finish("failed", 1);
        }
        void timeoutMs;
    }
    private consume(chunk: string): void {
        if (this.dead)
            return;
        this.buffer += chunk;
        if (!this.job)
            return;
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
        job.finish(Number.isFinite(code) && code === 0 ? "done" : "failed", Number.isFinite(code) ? code : 1);
    }
    private fail(message: string, code?: number | null): void {
        if (!this.job)
            return;
        const job = this.job;
        this.job = undefined;
        job.append(`\n${message}`);
        job.finish("failed", code ?? 1);
    }
    kill(): void {
        this.dead = true;
        killProcessTree(this.child, "SIGTERM");
        setTimeout(() => killProcessTree(this.child, "SIGKILL"), 2000);
        const index = pool.indexOf(this);
        if (index >= 0)
            pool.splice(index, 1);
    }
}

export async function executeShellCommand(command: string, cwd: string, options: ExecOptions = {}): Promise<ShellExecResult> {
    pruneJobs();
    if (options.signal?.aborted)
        return { ok: false, status: "killed", output: "command aborted before start" };
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const backgroundAfterMs = options.backgroundAfterMs ?? DEFAULT_BACKGROUND_MS;
    const useResident = process.platform !== "win32" && !needsOneShot(command);
    let job: ShellJob | undefined;
    if (useResident) {
        const resident = acquireResident(options.turn, cwd);
        if (resident === "busy")
            return { ok: false, status: "failed", output: "both pool shells are busy; poll or kill a session first" };
        if (resident === "limit")
            return { ok: false, status: "failed", output: spawnLimitMessage() };
        job = new ShellJob(command, cwd);
        resident.run(job, timeoutMs);
    }
    else {
        if (!maySpawn(options.turn))
            return { ok: false, status: "failed", output: spawnLimitMessage() };
        job = startOneShot(command, cwd);
    }
    jobs.set(job.id, job);
    const timer = setTimeout(() => job!.kill("timeout"), timeoutMs);
    const onAbort = () => job!.kill("killed");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
    };
    await Promise.race([job.done(), delay(backgroundAfterMs)]);
    if (job.status === "running") {
        cleanup();
        return {
            ok: true,
            status: "running",
            output: job.takeOutput(),
            sessionId: job.id,
            nextPollMs: job.nextPollMs,
        };
    }
    cleanup();
    return syncResult(job);
}

export async function pollShellSession(id: string, waitMs = 0): Promise<ShellExecResult | undefined> {
    pruneJobs();
    const job = jobs.get(id);
    if (!job)
        return undefined;
    return await pollOnce(job, waitMs);
}

async function pollOnce(job: ShellJob, waitMs: number): Promise<ShellExecResult> {
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

export function killShellSession(id: string): boolean {
    const job = jobs.get(id);
    if (!job || job.status !== "running")
        return false;
    job.kill("killed");
    return true;
}

export function listShellSessions(): ShellJobView[] {
    pruneJobs();
    return Array.from(jobs.values())
        .sort((a, b) => b.startedAt - a.startedAt)
        .map((job) => job.view());
}

export function shutdownShells(): void {
    for (const job of jobs.values()) {
        if (job.status === "running")
            job.kill("killed");
    }
    for (const resident of [...pool])
        resident.kill();
    pool.length = 0;
    jobs.clear();
}

export function shellPoolStats(): { spawns: number; active: number; pool: number; maxSpawnPerTurn: number } {
    return {
        spawns,
        active: Array.from(jobs.values()).filter((job) => job.status === "running").length,
        pool: pool.filter((resident) => !resident.dead).length,
        maxSpawnPerTurn: maxSpawnPerTurn(),
    };
}

function startOneShot(command: string, cwd: string): ShellJob {
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

function acquireResident(turn: number | undefined, cwd: string): ResidentShell | "busy" | "limit" {
    const idle = pool.find((resident) => !resident.dead && !resident.job);
    if (idle)
        return idle;
    if (pool.filter((resident) => !resident.dead).length >= MAX_POOL)
        return "busy";
    if (!maySpawn(turn))
        return "limit";
    const resident = new ResidentShell(cwd);
    pool.push(resident);
    return resident;
}

function needsOneShot(command: string): boolean {
    return /(^|\s)(vim|nano|less|more|ssh|su|login|read|top|htop|tmux|screen)(\s|$)/.test(command)
        || /(^|\s)(python|python3|node|bash|zsh|fish|irb|sqlite3)(\s|$)/.test(command) && !/\s-(c|e|m)\s/.test(command);
}

function maySpawn(turn: number | undefined): boolean {
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

function maxSpawnPerTurn(): number {
    const raw = Number(process.env["FASTCODE_MAX_SPAWN_PER_TURN"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8;
}

function spawnLimitMessage(): string {
    return `spawn limit reached (FASTCODE_MAX_SPAWN_PER_TURN=${maxSpawnPerTurn()}); batch commands or poll an existing session`;
}

function syncResult(job: ShellJob): ShellExecResult {
    return {
        ok: job.status === "done",
        status: job.status,
        output: job.takeOutput(),
        exitCode: job.exitCode,
        sessionId: job.id,
        nextPollMs: job.nextPollMs,
    };
}

function pruneJobs(): void {
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

function shellQuote(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
