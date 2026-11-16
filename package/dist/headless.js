/**
 * Non-Ink headless runner for `--ui json` / non-TTY `--ui plain`.
 *
 * stdout is reserved for the protocol/answer; diagnostics go to stderr.
 */
import readline from "node:readline";
import { AGENT_SYSTEM_PROMPT } from "./agent/protocol.js";
import { compactionConfigFromEnv } from "./agent/compaction.js";
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
let eventSeq = 0;
function writeEvent(value) {
    eventSeq += 1;
    process.stdout.write(JSON.stringify({ v: 1, seq: eventSeq, ts: new Date().toISOString(), ...value }) + "\n");
}
function optionalBudget(name) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
export async function runHeadless(options) {
    let config = loadConfig();
    setShellPoolSize(config.shellPoolSize);
    const provider = getProviderOrThrow(config.providerId);
    let apiKey;
    if (provider.authEnv.length > 0) {
        const lookup = resolveApiKey(provider.id, config.model, provider.authEnv);
        if (lookup.status !== "ok")
            throw new Error(`No usable API key for ${provider.id}.`);
        apiKey = lookup.key;
    }
    const history = options.resume ? resumeSession(options.resume, process.cwd()).messages : [];
    const system = [
        config.systemPrompt,
        buildSkillsPrompt(config.enabledSkills),
        buildPluginsPrompt(config.enabledPlugins),
        config.agentMode ? AGENT_SYSTEM_PROMPT : "",
    ].filter((part) => part.trim()).join("\n\n");
    const protocol = config.agentMode ? resolveToolProtocol(config, config.providerId, config.model) : "legacy";
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
            writeEvent(encodeGateAsk(request));
            const line = await nextLine(request.timeoutMs ?? 60_000);
            if (line === undefined) {
                const decision = { kind: "deny", reason: "approval timeout/EOF" };
                // No session log in headless: the decision frame is the record.
                writeEvent(encodeGateDecision(request, decision, "timeout/EOF"));
                return decision;
            }
            const parsed = parseGateDecision(request, line);
            writeEvent(encodeGateDecision(request, parsed.decision, parsed.error));
            if (parsed.error) {
                writeEvent({ event: "gate:error", version: 1, id: request.id, error: parsed.error });
                return parsed.decision;
            }
            return parsed.decision;
        }
        process.stderr.write(`${request.prompt ?? "Approval required"}\n`);
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
    const abort = new AbortController();
    let failed = false;
    let toolCallCount = 0;
    let httpRequestCount = 0;
    let lastTurn = 0;
    const onSigint = () => abort.abort();
    const onTerminate = () => abort.abort();
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onTerminate);
    process.once("SIGHUP", onTerminate);
    try {
        for await (const event of runAgent({
            provider,
            apiKey,
            model: config.model,
            messages: history,
            prompt: options.prompt,
            system,
            maxTurns: config.agentMode ? Math.max(1, Math.floor(Number(config.maxAgentTurns) || 24)) : 1,
            allowTools: config.agentMode,
            tokenBudget: optionalBudget("FASTCODE_TOKEN_BUDGET"),
            costBudgetUsd: optionalBudget("FASTCODE_COST_BUDGET_USD"),
            signal: abort.signal,
            cwd: process.cwd(),
            idleTimeoutMs: config.requestIdleTimeoutMs,
            compaction: compactionConfigFromEnv(),
            reasoningEffort: config.reasoningEffort,
            protocol,
            tools: protocol === "native" ? toolSchemas() : undefined,
            requestApproval,
            onProtocolFallback: (message) => {
                rememberToolCapability(config.providerId, config.model, "pseudo");
                if (options.ui === "json")
                    writeEvent({ event: "notice", text: message });
                else
                    process.stderr.write(`[fastcode] ${message}\n`);
            },
            onNativeOk: () => {
                if (protocol !== "native")
                    return;
                rememberToolCapability(config.providerId, config.model, "native");
            },
        })) {
            if (event.type === "assistant_raw")
                httpRequestCount += 1;
            if (options.ui === "json") {
                if (event.type === "assistant_text")
                    writeEvent({ event: "assistant", text: event.text });
                else if (event.type === "tool_call") {
                    toolCallCount += 1;
                    writeEvent({
                        event: "tool_call",
                        id: event.id,
                        tool: event.call.tool,
                        args: event.call,
                        ...(event.native ? { native: true } : {}),
                    });
                }
                else if (event.type === "loop_detected")
                    writeEvent({
                        event: "loop_detected",
                        fingerprint: event.fingerprint,
                        occurrences: event.occurrences,
                        warned: event.warned,
                    });
                else if (event.type === "compaction")
                    writeEvent({
                        event: "compaction",
                        before_chars: event.beforeChars,
                        after_chars: event.afterChars,
                        before_tokens: event.beforeTokens,
                        after_tokens: event.afterTokens,
                        dropped_messages: event.droppedMessages,
                        kept_messages: event.keptMessages,
                        reason: event.reason,
                        source: event.source,
                        ...(event.summaryFile ? { summary_file: event.summaryFile } : {}),
                    });
                else if (event.type === "checkpoint") {
                    lastTurn = event.turn;
                    writeEvent({
                        event: "checkpoint",
                        turn: event.turn,
                        cwd: event.cwd,
                        provider_id: event.providerId,
                        model: event.model,
                        active_files: event.activeFiles,
                    });
                }
                else if (event.type === "egress_denied")
                    writeEvent({
                        event: "egress_denied",
                        outlet: event.outlet,
                        ...(event.target ? { target: event.target } : {}),
                        rule: event.rule,
                        mode: event.mode,
                        would_block: event.wouldBlock,
                        code: event.code,
                        reason: event.reason,
                    });
                else if (event.type === "tool_result")
                    writeEvent({
                        event: "tool_result",
                        id: event.id,
                        tool: event.call.tool,
                        ok: event.ok,
                        output: event.output,
                        ...(event.sideEffects ? { side_effects: event.sideEffects } : {}),
                        ...(event.code ? { code: event.code } : {}),
                        ...(event.hint ? { hint: event.hint } : {}),
                        ...(event.truncated !== undefined ? { truncated: event.truncated } : {}),
                        ...(event.totalLines !== undefined ? { total_lines: event.totalLines } : {}),
                        ...(event.returnedLines !== undefined ? { returned_lines: event.returnedLines } : {}),
                        ...(event.totalBytes !== undefined ? { total_bytes: event.totalBytes } : {}),
                        ...(event.returnedBytes !== undefined ? { returned_bytes: event.returnedBytes } : {}),
                        ...(event.filesRead !== undefined ? { files_read: event.filesRead } : {}),
                        ...(event.filesSkipped !== undefined ? { files_skipped: event.filesSkipped } : {}),
                        ...(event.matches !== undefined ? { matches: event.matches } : {}),
                    });
                else if (event.type === "usage")
                    writeEvent({
                        event: "usage",
                        input_tokens: event.usage.inputTokens ?? 0,
                        output_tokens: event.usage.outputTokens ?? 0,
                        cost_usd: event.usage.costUsd ?? 0,
                    });
                else if (event.type === "notice")
                    writeEvent({ event: "notice", text: event.text });
                else if (event.type === "error") {
                    failed = true;
                    writeEvent({ event: "error", kind: event.kind, code: event.kind, message: event.message });
                }
                else if (event.type === "done") {
                    if (event.stopReason === "stream_error" || event.stopReason === "incomplete" || event.stopReason === "protocol_error" || event.stopReason === "loop_detected")
                        failed = true;
                    writeEvent({ event: "done", stopReason: event.stopReason, finalText: event.finalText });
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
                process.stderr.write(`[fastcode] error (${event.kind}): ${event.message}\n`);
            }
            else if (event.type === "done" && event.finalText) {
                if (event.stopReason === "stream_error" || event.stopReason === "incomplete" || event.stopReason === "protocol_error" || event.stopReason === "loop_detected")
                    failed = true;
                process.stdout.write(event.finalText + "\n");
            }
        }
        if (options.ui === "json")
            writeEvent({ event: "summary", tool_call_count: toolCallCount, http_request_count: httpRequestCount, last_turn: lastTurn });
    }
    finally {
        process.removeListener("SIGINT", onSigint);
        process.removeListener("SIGTERM", onTerminate);
        process.removeListener("SIGHUP", onTerminate);
        rl.close();
    }
    if (failed)
        process.exitCode = 1;
}
