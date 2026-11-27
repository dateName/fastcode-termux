/**
 * Non-Ink headless runner for `--ui json` / non-TTY `--ui plain`.
 *
 * stdout is reserved for the protocol/answer; diagnostics go to stderr.
 */
import readline from "node:readline";
import { agentSystemPrompt } from "./agent/protocol.js";
import { compactionConfigFromEnv, removeSummaryFile } from "./agent/compaction.js";
import { rememberToolCapability, resolveToolProtocol } from "./agent/protocol-mode.js";
import { runAgent } from "./agent/runner.js";
import { setShellPoolSize } from "./agent/shell-session.js";
import { toolSchemas } from "./agent/tool-schemas.js";
import { encodeGateAsk, encodeGateDecision, parseGateDecision } from "./agent/approval-json.js";
import { decisionForOption, parseApprovalChoice } from "./agent/approval.js";
import { buildPluginsPrompt } from "./plugins/manager.js";
import { buildSkillsPrompt } from "./skills/manager.js";
import { loadConfig, resolveApiKey } from "./config/store.js";
import { getProviderOrThrow } from "./providers/index.js";
import { resumeSession } from "./session/projection.js";
import { createSessionLog } from "./session/log.js";
import { discoverInstructions, formatInstructionPrompt } from "./session/instructions.js";
import { cleanupProcesses } from "./lib/lifecycle.js";
import { EventStream, headlessSessionId, serializeAgentEvent } from "./agent/event-stream.js";
import { dispatchHook, hookEventFor, hooksEnabledFromEnv, startHookHost, stopHookHost } from "./hooks/dispatch.js";
function optionalBudget(name) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
export async function runHeadless(options) {
    let config = loadConfig();
    setShellPoolSize(config.shellPoolSize);
    const headlessSession = process.env["FASTCODE_HEADLESS_SESSION_LOG"] !== "0"
        ? createSessionLog({ providerId: config.providerId, model: config.model, cwd: process.cwd() })
        : undefined;
    const stream = options.ui === "json" ? new EventStream(headlessSession?.id ?? headlessSessionId(options.resume)) : undefined;
    const provider = getProviderOrThrow(config.providerId);
    let apiKey;
    if (provider.authEnv.length > 0) {
        const lookup = resolveApiKey(provider.id, config.model, provider.authEnv);
        if (lookup.status !== "ok")
            throw new Error(`No usable API key for ${provider.id}.`);
        apiKey = lookup.key;
    }
    const history = options.resume ? resumeSession(options.resume, process.cwd()).messages : [];
    const protocol = config.agentMode ? resolveToolProtocol(config, config.providerId, config.model) : "legacy";
    const system = [
        config.systemPrompt,
        buildSkillsPrompt(config.enabledSkills),
        buildPluginsPrompt(config.enabledPlugins),
        formatInstructionPrompt(discoverInstructions(process.cwd()).entries),
        config.agentMode ? agentSystemPrompt(protocol) : "",
    ].filter((part) => part.trim()).join("\n\n");
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    const queued = [];
    const waiters = [];
    let eof = false;
    rl.on("line", (line) => {
        const waiter = waiters.shift();
        if (waiter)
            waiter(line);
        else
            queued.push(line);
    });
    rl.on("close", () => {
        eof = true;
        while (waiters.length > 0)
            waiters.shift()(undefined);
    });
    const nextLine = (timeoutMs) => {
        if (queued.length > 0)
            return Promise.resolve(queued.shift());
        if (eof)
            return Promise.resolve(undefined);
        return new Promise((resolve) => {
            const waiter = (line) => {
                clearTimeout(timer);
                resolve(line);
            };
            const timer = setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0)
                    waiters.splice(index, 1);
                resolve(undefined);
            }, Math.max(1000, timeoutMs));
            timer.unref?.();
            waiters.push(waiter);
        });
    };
    const requestApproval = async (request) => {
        if (options.ui === "json") {
            stream.emit(encodeGateAsk(request, { diffPreview: config.diffPreview !== false }));
            const line = await nextLine(request.timeoutMs ?? 60_000);
            if (line === undefined) {
                const decision = { kind: "deny", reason: "approval timeout/EOF" };
                // Headless decisions are also appended to the session log; set FASTCODE_HEADLESS_SESSION_LOG=0 to disable.
                stream.emit(encodeGateDecision(request, decision, "timeout/EOF"));
                return decision;
            }
            const parsed = parseGateDecision(request, line);
            stream.emit(encodeGateDecision(request, parsed.decision, parsed.error));
            if (parsed.error) {
                stream.emit({ event: "gate:error", id: request.id, error: parsed.error });
                return parsed.decision;
            }
            return parsed.decision;
        }
        process.stderr.write(`${request.prompt ?? "Approval required"}\n`);
        if (config.diffPreview !== false && request.patchDiffs?.length) {
            const diffLines = request.patchDiffs.flatMap((diff) => [`### ${diff.path}`, ...diff.unified.split(/\r?\n/)]);
            process.stderr.write(`${diffLines.slice(0, 20).join("\n")}${diffLines.length > 20 ? "\n[... diff truncated ...]" : ""}\n`);
        }
        request.options.forEach((option, index) => process.stderr.write(`${index + 1}. ${option.label}\n`));
        process.stderr.write(`Choose 1-${request.options.length}: `);
        const line = await nextLine(request.timeoutMs ?? 60_000);
        const option = line === undefined ? undefined : parseApprovalChoice(request, line);
        if (!option)
            return { kind: "deny", reason: "approval cancelled/invalid/timeout" };
        if (option.kind === "feedback") {
            process.stderr.write(`${option.prompt || "Why should this be denied?"}\n> `);
            const feedbackLine = await nextLine(request.timeoutMs ?? 60_000);
            const feedback = feedbackLine?.trim();
            return feedback
                ? { kind: "feedback", text: feedback }
                : { kind: "deny", reason: "feedback cancelled/empty (fail closed)" };
        }
        return decisionForOption(option);
    };
    if (options.longRun && !process.env["FASTCODE_TOKEN_BUDGET"] && !process.env["FASTCODE_COST_BUDGET_USD"])
        process.stderr.write("[fastcode] LONG-RUN: no token/cost budget is set; the run is uncapped until stopped.\n");
    let headlessCompaction = undefined;
    const abort = new AbortController();
    let failed = false;
    let toolCallCount = 0;
    let httpRequestCount = 0;
    const headlessSummaries = new Set();
    let lastTurn = 0;
    let lastStopReason = "";
    let headlessCheckpointSeq = 0;
    const onSigint = () => abort.abort();
    const onTerminate = () => abort.abort();
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onTerminate);
    process.once("SIGHUP", onTerminate);
    try {
        await startHookHost({
            enabled: hooksEnabledFromEnv(),
            taskId: headlessSession?.id,
            cwd: process.cwd(),
            providerId: config.providerId,
            model: config.model,
        });
        for await (const event of runAgent({
            provider,
            apiKey,
            model: config.model,
            messages: history,
            prompt: options.prompt,
            system,
            maxTurns: config.agentMode ? (options.longRun ? Math.max(9999, Math.floor(Number(config.maxAgentTurns) || 24)) : Math.max(1, Math.floor(Number(config.maxAgentTurns) || 24))) : 1,
            allowTools: config.agentMode,
            tokenBudget: optionalBudget("FASTCODE_TOKEN_BUDGET"),
            costBudgetUsd: optionalBudget("FASTCODE_COST_BUDGET_USD"),
            signal: abort.signal,
            cwd: process.cwd(),
            idleTimeoutMs: config.requestIdleTimeoutMs,
            compaction: (() => { const value = compactionConfigFromEnv(); if (options.longRun)
                value.anchorChars = 30_000; return value; })(),
            reasoningEffort: config.reasoningEffort,
            protocol,
            tools: protocol === "native" ? toolSchemas() : undefined,
            requestApproval,
            onProtocolFallback: (message) => {
                rememberToolCapability(config.providerId, config.model, "pseudo");
                if (options.ui === "json")
                    stream.emit({ event: "notice", text: message });
                else
                    process.stderr.write(`[fastcode] ${message}\n`);
            },
            onNativeOk: () => {
                if (protocol !== "native")
                    return;
                rememberToolCapability(config.providerId, config.model, "native");
            },
        })) {
            if (event.type === "assistant_raw") {
                httpRequestCount += 1;
                headlessSession?.append({ type: "assistant_raw", content: event.text, ...(event.toolCalls ? { toolCalls: event.toolCalls } : {}) });
            }
            if (event.type === "tool_call")
                headlessSession?.append({ type: "tool_call", id: event.id, tool: event.call.tool, args: event.call, native: Boolean(event.native) });
            if (event.type === "tool_result")
                headlessSession?.append({ type: "tool_result", id: event.id, tool: event.call.tool, ok: event.ok, output: event.output, ...(event.rawOutput ? { rawOutput: event.rawOutput } : {}) });
            if (event.type === "notice")
                headlessSession?.append({ type: "notice", content: event.text });
            if (event.type === "egress_denied")
                headlessSession?.append({ type: "egress_denied", outlet: event.outlet, target: event.target, rule: event.rule, mode: event.mode, wouldBlock: event.wouldBlock, code: event.code, reason: event.reason });
            if (event.type === "compaction") {
                if (event.summaryFile)
                    headlessSummaries.add(event.summaryFile);
                headlessCompaction = { source: event.source, summaryRef: event.summaryFile ?? null };
                headlessSession?.append({ type: "compacted", source: event.source, summaryRef: event.summaryFile, reason: event.reason, beforeTokens: event.beforeTokens, afterTokens: event.afterTokens, droppedMessages: event.droppedMessages, keepMessages: event.keptMessages });
                if (event.reason === "anchor")
                    headlessSession?.checkpoint?.();
            }
            if (options.ui === "json") {
                if (event.type === "checkpoint") {
                    lastTurn = event.turn;
                    headlessCheckpointSeq += 1;
                    stream.setTurn(event.turn + 1);
                }
                if (event.type === "tool_call")
                    toolCallCount += 1;
                if (event.type === "error")
                    failed = true;
                if (event.type === "done")
                    lastStopReason = event.stopReason;
                if (event.type === "done" &&
                    (event.stopReason === "stream_error" || event.stopReason === "incomplete" || event.stopReason === "protocol_error" || event.stopReason === "loop_detected"))
                    failed = true;
                const frame = serializeAgentEvent(event);
                if (frame) {
                    if (event.type === "checkpoint")
                        frame.last_fact_seq = headlessCheckpointSeq;
                    stream.emit(frame, event.type === "checkpoint" ? event.turn : undefined);
                }
            }
            else if (event.type === "assistant_text") {
                process.stdout.write(event.text);
            }
            else if (event.type === "notice") {
                process.stderr.write(`[fastcode] ${event.text}\n`);
            }
            else if (event.type === "error") {
                // Plain mode must not fail silently: errors go to stderr and
                // the process exits non-zero so scripts can detect the failure.
                failed = true;
                process.stderr.write(`[fastcode] error (${event.kind}): ${event.message}${event.detail ? `\n${event.detail}` : ""}\n`);
            }
            else if (event.type === "done" && event.finalText) {
                if (event.stopReason === "stream_error" || event.stopReason === "incomplete" || event.stopReason === "protocol_error" || event.stopReason === "loop_detected")
                    failed = true;
                process.stdout.write(event.finalText + "\n");
            }
            const hookEvent = hookEventFor(event);
            if (hookEvent)
                await dispatchHook(hookEvent, { taskId: headlessSession?.id, cwd: process.cwd(), providerId: config.providerId, model: config.model });
        }
        if (options.ui === "json")
            stream.emit({ event: "summary", tool_call_count: toolCallCount, http_request_count: httpRequestCount, last_turn: lastTurn, ...(lastStopReason ? { stop_reason: lastStopReason } : {}) }, lastTurn);
    }
    finally {
        await stopHookHost();
        process.removeListener("SIGINT", onSigint);
        process.removeListener("SIGTERM", onTerminate);
        process.removeListener("SIGHUP", onTerminate);
        headlessSession?.close({ reason: "exit", ...(headlessCompaction ? { compaction: headlessCompaction } : {}) });
        rl.close();
        const latestSummary = Array.from(headlessSummaries).at(-1);
        for (const ref of headlessSummaries) {
            if (ref !== latestSummary)
                removeSummaryFile(ref);
        }
        // Resident shells keep the event loop alive; a normal headless finish
        // must release them just like the TUI and signal paths do.
        cleanupProcesses();
    }
    if (failed)
        process.exitCode = 1;
}
