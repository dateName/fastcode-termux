/**
 * Non-Ink headless runner for `--ui json` / non-TTY `--ui plain`.
 *
 * stdout is reserved for the protocol/answer; diagnostics go to stderr.
 */
import readline from "node:readline";
import { AGENT_SYSTEM_PROMPT } from "./agent/protocol.js";
import { compactionConfigFromEnv } from "./agent/compaction.js";
import { resolveToolProtocol } from "./agent/protocol-mode.js";
import { runAgent } from "./agent/runner.js";
import { toolSchemas } from "./agent/tool-schemas.js";
import { encodeGateAsk, parseGateDecision } from "./agent/approval-json.js";
import { decisionForOption, parseApprovalChoice, type ApprovalDecision, type ApprovalRequest } from "./agent/approval.js";
import { buildPluginsPrompt } from "./plugins/manager.js";
import { buildSkillsPrompt } from "./skills/manager.js";
import { loadConfig, resolveApiKey } from "./config/store.js";
import { getProviderOrThrow } from "./providers/index.js";
import { resumeSession } from "./session/projection.js";

interface HeadlessOptions {
    prompt: string;
    ui: "json" | "plain";
    resume?: string;
}

function writeEvent(value: unknown): void {
    process.stdout.write(JSON.stringify(value) + "\n");
}

function optionalBudget(name: string): number | undefined {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function runHeadless(options: HeadlessOptions): Promise<void> {
    const config = loadConfig();
    const provider = getProviderOrThrow(config.providerId);
    let apiKey: string | undefined;
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
    const queued: string[] = [];
    const waiters: Array<(line: string | undefined) => void> = [];
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
            waiters.shift()!(undefined);
    });
    const nextLine = (timeoutMs: number): Promise<string | undefined> => {
        if (queued.length > 0)
            return Promise.resolve(queued.shift());
        if (eof)
            return Promise.resolve(undefined);
        return new Promise((resolve) => {
            const waiter = (line: string | undefined) => {
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

    const requestApproval = async (request: ApprovalRequest): Promise<ApprovalDecision> => {
        if (options.ui === "json") {
            writeEvent(encodeGateAsk(request));
            const line = await nextLine(request.timeoutMs ?? 60_000);
            if (line === undefined)
                return { kind: "deny", reason: "approval timeout/EOF" };
            const parsed = parseGateDecision(request, line);
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
        return option ? decisionForOption(option) : { kind: "deny", reason: "approval cancelled/invalid/timeout" };
    };

    const abort = new AbortController();
    const onSigint = () => abort.abort();
    process.once("SIGINT", onSigint);
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
        })) {
            if (options.ui === "json") {
                if (event.type === "assistant_text")
                    writeEvent({ event: "assistant", text: event.text });
                else if (event.type === "tool_result")
                    writeEvent({ event: "tool_result", id: event.id, tool: event.call.tool, ok: event.ok });
                else if (event.type === "error")
                    writeEvent({ event: "error", kind: event.kind, message: event.message });
                else if (event.type === "done")
                    writeEvent({ event: "done", stopReason: event.stopReason, finalText: event.finalText });
            }
            else if (event.type === "assistant_text") {
                process.stdout.write(event.text);
            }
            else if (event.type === "done" && event.finalText) {
                process.stdout.write(event.finalText + "\n");
            }
        }
    }
    finally {
        process.removeListener("SIGINT", onSigint);
        rl.close();
    }
}
