/**
 * M2 public SDK wrapper: runTask() + TaskHandle.
 *
 * This wraps the existing agent/runner generator; it does not change runAgent,
 * the AgentEvent closed set, or the v:1 NDJSON envelope.
 */
import type { AgentEvent, AgentStopReason } from "../agent/runner.js";
import { runAgent } from "../agent/runner.js";
import { agentSystemPrompt } from "../agent/protocol.js";
import { resolveToolProtocol } from "../agent/protocol-mode.js";
import { toolSchemas } from "../agent/tool-schemas.js";
import { compactionConfigFromEnv } from "../agent/compaction.js";
import { loadConfig, resolveApiKey } from "../config/store.js";
import { getProviderOrThrow } from "../providers/index.js";
import { createSessionLog } from "../session/log.js";
import { discoverInstructions, formatInstructionPrompt } from "../session/instructions.js";
import { shutdownShells } from "../agent/shell-session.js";
import { dispatchHook, hookEventFor, startHookHost, stopHookHost } from "../hooks/dispatch.js";
import type { RunConfig, RunError, RunOptions, RunResult, TaskHandle } from "../public/types.js";
import {
    runErrorForErrorKind,
    runErrorForStopReason,
    taskStatusForStopReason,
} from "./error-map.js";

type SessionLog = ReturnType<typeof createSessionLog>;

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`RunConfig.${field} must be a non-empty string`);
    }
}

/**
 * Synchronous validation. runTask is intentionally NOT async so a bad config
 * rejects via a thrown error instead of a rejected promise.
 */
function validateConfig(config: RunConfig): void {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("RunConfig must be an object");
    }
    assertNonEmptyString(config.prompt, "prompt");
    if (config.provider !== undefined)
        assertNonEmptyString(config.provider, "provider");
    if (config.model !== undefined)
        assertNonEmptyString(config.model, "model");
    if (config.taskId !== undefined)
        assertNonEmptyString(config.taskId, "taskId");
    if (config.cwd !== undefined)
        assertNonEmptyString(config.cwd, "cwd");
    if (config.system !== undefined && typeof config.system !== "string")
        throw new Error("RunConfig.system must be a string");
    if (config.maxTurns !== undefined && (!Number.isInteger(config.maxTurns) || config.maxTurns < 1))
        throw new Error("RunConfig.maxTurns must be a positive integer");
    if (config.signal !== undefined && !(config.signal instanceof AbortSignal))
        throw new Error("RunConfig.signal must be an AbortSignal");
    if (config.signal?.aborted)
        throw new Error("RunConfig.signal is already aborted");
}

function buildSystem(config: RunConfig, store: ReturnType<typeof loadConfig>, protocol: "legacy" | "native"): string {
    if (config.system !== undefined)
        return config.system;
    const cwd = config.cwd ?? process.cwd();
    return [
        store.systemPrompt,
        formatInstructionPrompt(discoverInstructions(cwd).entries),
        store.agentMode ? agentSystemPrompt(protocol) : "",
    ].filter((part) => part.trim().length > 0).join("\n\n");
}

function recordFact(session: SessionLog, event: AgentEvent): void {
    switch (event.type) {
        case "assistant_raw":
            session.append({ type: "assistant_raw", content: event.text, ...(event.toolCalls ? { toolCalls: event.toolCalls } : {}) });
            return;
        case "tool_call":
            session.append({ type: "tool_call", id: event.id, tool: event.call.tool, args: event.call, native: Boolean(event.native) });
            return;
        case "tool_result":
            session.append({
                type: "tool_result",
                id: event.id,
                tool: event.call.tool,
                ok: event.ok,
                output: event.output,
                ...(event.rawOutput ? { rawOutput: event.rawOutput } : {}),
            });
            return;
        case "notice":
            session.append({ type: "notice", content: event.text });
            return;
        case "egress_denied":
            session.append({
                type: "egress_denied",
                outlet: event.outlet,
                target: event.target,
                rule: event.rule,
                mode: event.mode,
                wouldBlock: event.wouldBlock,
                code: event.code,
                reason: event.reason,
            });
            return;
        case "compaction":
            session.append({
                type: "compacted",
                source: event.source,
                summaryRef: event.summaryFile,
                reason: event.reason,
                beforeTokens: event.beforeTokens,
                afterTokens: event.afterTokens,
                droppedMessages: event.droppedMessages,
                keepMessages: event.keptMessages,
            });
            return;
        default:
            return;
    }
}

function infrastructureError(error: unknown): RunError {
    const message = error instanceof Error ? error.message : String(error);
    return { code: "INFRASTRUCTURE", category: "infrastructure", retryable: false, message };
}

function safeCall(fn: (() => void) | undefined): void {
    if (!fn)
        return;
    try {
        fn();
    }
    catch {
        // Consumer callback failures must not corrupt the run lifecycle.
    }
}

export function runTask(config: RunConfig, options: RunOptions = {}): Promise<TaskHandle> {
    validateConfig(config);

    const store = loadConfig();
    const provider = getProviderOrThrow(config.provider ?? store.providerId);
    const model = config.model ?? store.model ?? provider.defaultModel;
    const cwd = config.cwd ?? process.cwd();
    const maxTurns = config.maxTurns ?? (store.agentMode ? Math.max(1, Math.floor(Number(store.maxAgentTurns) || 24)) : 1);
    const protocol = store.agentMode ? resolveToolProtocol(store, provider.id, model) : "legacy";
    const system = buildSystem(config, store, protocol);

    let apiKey: string | undefined;
    if (provider.authEnv.length > 0) {
        const lookup = resolveApiKey(provider.id, model, provider.authEnv);
        if (lookup.status !== "ok") {
            throw new Error(`No usable API key for ${provider.id}. Run \`fastcode login\` or set ${provider.authEnv.join("/")}.`);
        }
        apiKey = lookup.key;
    }

    const session = createSessionLog({ providerId: provider.id, model, cwd });
    const taskId = config.taskId ?? session.id;
    const startedAt = Date.now();
    const abort = new AbortController();

    let stopRequested = false;
    const requestStop = () => {
        if (stopRequested)
            return;
        stopRequested = true;
        abort.abort();
    };
    if (config.signal)
        config.signal.addEventListener("abort", requestStop, { once: true });

    let resolveWait!: (result: RunResult) => void;
    const waitPromise = new Promise<RunResult>((resolve) => {
        resolveWait = resolve;
    });
    let settled = false;
    let lastStopReason: AgentStopReason = "complete";
    let lastError: RunError | null = null;

    const finish = async (result: RunResult) => {
        if (settled)
            return;
        settled = true;
        if (config.signal)
            config.signal.removeEventListener("abort", requestStop);
        try {
            await stopHookHost();
        }
        catch {
            // Hook cleanup must never fail the run.
        }
        session.close({ reason: stopRequested ? "signal" : "exit" });
        try {
            shutdownShells();
        }
        catch {
            // Best effort: a resident shell must not keep the SDK run alive.
        }
        resolveWait(result);
        if (result.error && !stopRequested)
            safeCall(() => options.onError?.(result.error as RunError));
        else
            safeCall(() => options.onComplete?.(result));
    };

    session.append({ type: "user", content: config.prompt });

    const pump = async () => {
        try {
            await startHookHost({ enabled: options.enableHooks === true, taskId, cwd, providerId: provider.id, model });
        }
        catch (error) {
            process.stderr.write(`[fastcode] hooks: ${String((error as Error)?.message ?? error)}\n`);
        }
        try {
            for await (const event of runAgent({
                provider,
                apiKey,
                model,
                prompt: config.prompt,
                system,
                maxTurns,
                allowTools: store.agentMode,
                signal: abort.signal,
                cwd,
                idleTimeoutMs: store.requestIdleTimeoutMs,
                compaction: compactionConfigFromEnv(),
                reasoningEffort: store.reasoningEffort,
                protocol,
                tools: protocol === "native" ? toolSchemas() : undefined,
            })) {
                recordFact(session, event);
                safeCall(() => options.onEvent?.(event));
                if (event.type === "notice")
                    safeCall(() => options.onProgress?.(event.text));
                else if (event.type === "checkpoint")
                    safeCall(() => options.onProgress?.(`turn ${event.turn} checkpoint`));
                else if (event.type === "compaction")
                    safeCall(() => options.onProgress?.(`compacted (${event.reason})`));
                if (event.type === "error")
                    lastError = runErrorForErrorKind(event.kind, event.message);
                if (event.type === "done")
                    lastStopReason = event.stopReason;
                const hookEvent = hookEventFor(event);
                if (hookEvent)
                    await dispatchHook(hookEvent, { taskId, cwd, providerId: provider.id, model });
            }

            await finish({
                taskId,
                status: stopRequested ? "stopped" : taskStatusForStopReason(lastStopReason),
                sessionId: session.id,
                error: stopRequested ? null : (lastError ?? runErrorForStopReason(lastStopReason)),
                logPath: session.file,
                durationMs: Date.now() - startedAt,
            });
        }
        catch (error) {
            if (stopRequested) {
                await finish({
                    taskId,
                    status: "stopped",
                    sessionId: session.id,
                    error: null,
                    logPath: session.file,
                    durationMs: Date.now() - startedAt,
                });
                return;
            }
            const runError = infrastructureError(error);
            lastError = runError;
            await finish({
                taskId,
                status: "failed",
                sessionId: session.id,
                error: runError,
                logPath: session.file,
                durationMs: Date.now() - startedAt,
            });
        }
    };

    // Defer one macrotask so the caller receives the handle before the first
    // provider event can fire (runTask returns before any onEvent).
    setTimeout(() => { void pump(); }, 0);

    return Promise.resolve({
        taskId,
        logPath: session.file,
        wait: () => waitPromise,
        stop: async () => { requestStop(); },
    });
}
