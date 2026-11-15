/**
 * CLI-as-provider backend using a canonical NDJSON stream.
 *
 * Security boundary: the child only *proposes* work. It may emit text,
 * thinking, usage and complete tool calls; it never executes a tool. The host
 * runs every proposed call through `runAgentTool → registry.execute`, so
 * guards, approval, side effects, egress and session facts stay authoritative.
 *
 * The child receives an allowlisted environment (not `process.env`), so API
 * keys in auth.json or unrelated shell secrets are absent by construction.
 *
 * Wire format (one JSON object per line on stdout):
 *   {"type":"text-delta","text":"..."}
 *   {"type":"thinking-delta","text":"..."}
 *   {"type":"tool-call","id":"c1","name":"read_file","arguments":{"path":"a"}}
 *   {"type":"usage","inputTokens":1,"outputTokens":2}
 *   {"type":"done"}
 * Input (one line on stdin):
 *   {"type":"user","content":"...","system":"...","model":"..."}
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ChatChunk, ChatRequest, NativeToolCall, Provider, ProviderModel } from "../types.js";
import { buildChildEnv, redactSecrets } from "../lib/child-env.js";
import { terminateProcessTree } from "../lib/process-tree.js";
import { assertNever } from "../lib/values.js";

export interface StdioBackendConfig {
    id: string;
    label: string;
    /** Executable to spawn (not a shell string). */
    command: string;
    /** Fixed argv. */
    args?: string[];
    /** Extra argv applied to every turn. */
    turnArgs?: string[];
    cwd?: string;
    /** Extra environment names allowed through from the host. */
    envAllowlist?: string[];
    /** Explicitly injected values (applied after the allowlist). */
    env?: Record<string, string | undefined>;
    staticModels?: ProviderModel[];
    /** How many stderr lines to keep for a failure tail. */
    stderrLines?: number;
}

type CanonicalEvent =
    | { type: "text-delta"; text: string }
    | { type: "thinking-delta"; text: string }
    | { type: "tool-call"; id?: string; name: string; arguments: string }
    | { type: "usage"; usage: NonNullable<ChatChunk["usage"]> }
    | { type: "error"; message: string }
    | { type: "done" };

/** Parse one stdout line; debug noise and malformed lines are skipped. */
export function parseCanonicalLine(line: string): CanonicalEvent | undefined {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{"))
        return undefined;
    let value: any;
    try {
        value = JSON.parse(trimmed);
    }
    catch {
        return undefined;
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    switch (value.type) {
        case "text-delta":
        case "text":
            return typeof value.text === "string" ? { type: "text-delta", text: value.text } : undefined;
        case "thinking-delta":
        case "thinking":
            return typeof value.text === "string" ? { type: "thinking-delta", text: value.text } : undefined;
        case "tool-call": {
            if (typeof value.name !== "string" || !value.name)
                return undefined;
            const args = typeof value.arguments === "string"
                ? value.arguments
                : JSON.stringify(value.arguments ?? {});
            return {
                type: "tool-call",
                ...(typeof value.id === "string" && value.id ? { id: value.id } : {}),
                name: value.name,
                arguments: args,
            };
        }
        case "usage": {
            const usage = {
                inputTokens: numberOrUndefined(value.inputTokens ?? value.input_tokens),
                outputTokens: numberOrUndefined(value.outputTokens ?? value.output_tokens),
                totalTokens: numberOrUndefined(value.totalTokens ?? value.total_tokens),
                costUsd: numberOrUndefined(value.costUsd ?? value.cost_usd),
            };
            return { type: "usage", usage };
        }
        case "error":
            return typeof value.message === "string" ? { type: "error", message: value.message } : undefined;
        case "done":
            return { type: "done" };
        default:
            return undefined;
    }
}

/**
 * Build a Provider that runs one child per turn and consumes canonical NDJSON.
 * The provider is intentionally not registered by default: enabling a CLI
 * backend is an explicit configuration decision.
 */
export function createStdioProvider(config: StdioBackendConfig): Provider {
    const models = config.staticModels ?? [];
    return {
        id: config.id,
        label: config.label,
        authEnv: [],
        baseUrl: "",
        defaultModel: models[0]?.id ?? "",
        modelsPath: null,
        transport: "stdio",
        authKind: "local-login",
        capabilities: {
            streaming: true,
            toolCalling: true,
            reasoning: true,
            usage: true,
            resumable: false,
            retryable: false,
        },
        listModels: async () => models,
        stream: (req: ChatRequest) => streamStdio(config, req),
    };
}

async function* streamStdio(config: StdioBackendConfig, req: ChatRequest): AsyncGenerator<ChatChunk> {
    const signal = req.signal;
    if (signal?.aborted)
        throw abortError();
    const env = buildChildEnv(config.envAllowlist, config.env);
    const args = [...(config.args ?? []), ...(config.turnArgs ?? [])];
    const child = spawn(config.command, args, {
        cwd: config.cwd ?? process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
    });
    const stderrTail: string[] = [];
    const keep = Math.max(1, Math.floor(config.stderrLines ?? 20));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r?\n/)) {
            if (!line)
                continue;
            stderrTail.push(line);
            while (stderrTail.length > keep)
                stderrTail.shift();
        }
    });
    let rl: ReturnType<typeof createInterface> | undefined;
    const onAbort = () => {
        // Close our read side first so the async loop cannot wait for a
        // process that is slow to die; then terminate the whole tree.
        rl?.close();
        try {
            child.kill();
        }
        catch {
            // Already gone.
        }
        terminateProcessTree(child);
        child.stdout?.destroy();
        child.stdin?.destroy();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.once("close", (code, sig) => resolve({ code, signal: sig }));
    });
    const spawnFailed = new Promise<never>((_resolve, reject) => child.once("error", reject));
    const aborted = new Promise<never>((_resolve, reject) => {
        if (signal?.aborted)
            reject(abortError());
        else
            signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    });
    // Keep a handler attached even on the early-return paths below so a spawn
    // failure never surfaces as an unhandled rejection.
    void spawnFailed.catch(() => undefined);
    void aborted.catch(() => undefined);
    child.stdin?.on("error", () => undefined);
    try {
        if (!child.stdin || !child.stdout)
            throw new Error("stdio backend failed to attach stdin/stdout pipes");
        if (signal?.aborted)
            throw abortError();
        const last = req.messages[req.messages.length - 1];
        child.stdin.end(JSON.stringify({
            type: "user",
            content: last?.content ?? "",
            ...(req.system ? { system: req.system } : {}),
            model: req.model,
        }) + "\n");
        rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
        const toolCalls: NativeToolCall[] = [];
        let usage: ChatChunk["usage"];
        let done = false;
        let terminal = false;
        for await (const line of rl) {
            if (signal?.aborted)
                throw abortError();
            const event = parseCanonicalLine(line);
            if (!event)
                continue;
            // Terminal latch: a `done` record closes the turn; later records are
            // ignored so a malformed backend cannot append a tool call after
            // the host has already treated the turn as finished.
            if (terminal)
                continue;
            switch (event.type) {
                case "text-delta":
                    if (event.text)
                        yield { delta: event.text, done: false };
                    break;
                case "thinking-delta":
                    if (event.text)
                        yield { delta: "", done: false, reasoning: event.text };
                    break;
                case "tool-call":
                    toolCalls.push({
                        id: event.id ?? `call_${toolCalls.length}`,
                        name: event.name,
                        arguments: event.arguments,
                    });
                    break;
                case "usage":
                    usage = event.usage;
                    break;
                case "error":
                    throw new Error(event.message);
                case "done":
                    done = true;
                    terminal = true;
                    break;
                default:
                    assertNever(event, "streamStdio");
            }
        }
        const exit = await Promise.race([closed, spawnFailed, aborted]);
        if (!done) {
            if (signal?.aborted)
                throw abortError();
            throw new Error(describeExit(exit, stderrTail));
        }
        yield {
            delta: "",
            done: true,
            ...(usage ? { usage } : {}),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
        };
    }
    finally {
        signal?.removeEventListener("abort", onAbort);
        rl?.close();
        if (child.exitCode === null && child.signalCode === null)
            terminateProcessTree(child);
        child.stdin?.destroy();
        child.stdout?.destroy();
    }
}

function describeExit(exit: { code: number | null; signal: NodeJS.Signals | null }, stderrTail: string[]): string {
    const status = exit.signal ? `signal ${exit.signal}` : `code ${exit.code ?? "null"}`;
    const tail = redactSecrets(stderrTail.slice(-10).join("\n")).trim();
    return `stdio backend exited before done (${status})${tail ? `: ${tail}` : ""}`;
}

function numberOrUndefined(value: unknown): number | undefined {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : undefined;
}

function abortError(): Error {
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
}
