import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * FastCode App component — the heart of the TUI.
 *
 * Responsibilities:
 *   • Render banner, transcript, prompt, and status bar.
 *   • Drive the chat loop: send user messages, stream provider responses,
 *     update token/cost state, and persist config across runs.
 *   • Dispatch slash commands.
 *   • Cancel streaming on Esc and quit cleanly on /exit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { AGENT_SYSTEM_PROMPT, stripToolCalls, } from "./agent/protocol.js";
import { compactionConfigFromEnv } from "./agent/compaction.js";
import { resolveToolProtocol, withToolCapability } from "./agent/protocol-mode.js";
import { runAgent } from "./agent/runner.js";
import { toolSchemas } from "./agent/tool-schemas.js";
import { shutdownShells } from "./agent/shell-session.js";
import { Banner } from "./ui/Banner.js";
import { Spinner } from "./ui/Spinner.js";
import { StatusBar } from "./ui/StatusBar.js";
import { MessageBubble } from "./ui/Message.js";
import { Prompt } from "./ui/Prompt.js";
import { Picker } from "./ui/Picker.js";
import { COMMANDS, findCommand, parseSlash } from "./commands/index.js";
import { saveScopedKey } from "./commands/login.js";
import { getProvider, getProviderOrThrow, PROVIDERS } from "./providers/index.js";
import { loadConfig, saveConfig, resolveApiKey, getLegacy, } from "./config/store.js";
import { getTheme } from "./config/themes.js";
import { createStartupTranscript } from "./lib/startup.js";
import { shouldUseLiveStreamingUi, shouldUseStableTerminalUi } from "./lib/uiMode.js";
import { buildPluginsPrompt } from "./plugins/manager.js";
import { buildSkillsPrompt } from "./skills/manager.js";
import { createSessionLog, latestUnclosedSession, loggingEnabled, openSessionLog } from "./session/log.js";
import { resumeSession } from "./session/projection.js";
import { isTrusted, trustProject } from "./config/trust.js";
import { TrustGate } from "./ui/TrustGate.js";
/**
 * Mask the secret part of a `/login` invocation in the transcript:
 * `/login prov` → unchanged, `/login prov <key>` → key masked,
 * `/login prov model <key>` → provider/model shown, key masked.
 */
function maskLoginEcho(args) {
    const parts = ["/login", args[0] ?? ""];
    if (args.length === 2) {
        parts.push("********");
    }
    else if (args.length >= 3) {
        parts.push(args[1]);
        for (let i = 2; i < args.length; i += 1)
            parts.push("********");
    }
    return parts.filter((p) => p !== "").join(" ");
}
function positiveInt(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function streamingTail(text, maxLines = 6) {
    const lines = String(text ?? "").split(/\r?\n/);
    if (lines.length <= maxLines)
        return String(text ?? "");
    return "…\n" + lines.slice(-maxLines).join("\n");
}
function collapseToolOutput(output) {
    const text = String(output ?? "");
    const lines = text.split(/\r?\n/);
    const first = (lines.find((line) => line.trim()) ?? "").trim();
    const clipped = first.length > 160 ? first.slice(0, 157) + "..." : first;
    const rest = Math.max(0, lines.length - 1);
    return `${clipped}${clipped ? "\n" : ""}[${rest} more lines, ${text.length} chars]`;
}
function optionalBudget(name) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
function unclosedNotice(session) {
    const where = session.cwd || "(unknown directory)";
    const files = session.activeFiles?.length ?? 0;
    return `Last session did not close normally (${where}, ~${session.turns} turns, ${files} file${files === 1 ? "" : "s"} changed).\n` +
        `Resume it with \`fastcode resume ${session.id}\`, or list sessions with \`fastcode sessions\`.`;
}
function streamErrorMessage(message, provider, model) {
    if (/\b(401|403)\b/.test(message) || /invalid api key|unauthorized|authentication/i.test(message)) {
        return `Authentication failed for ${provider.label} · ${model}. The key may be wrong or not allowed for this model.\n` +
            `Check with \`/whoami\`, or re-save: \`/login ${provider.id} ${model} <key>\`.`;
    }
    if (/\b(402|429)\b/.test(message) || /quota|insufficient|rate limit|billing|balance/i.test(message)) {
        return `Request blocked: ${provider.label} reports no remaining quota / rate limit for ${model}.\n` +
            `Top up the account or switch model/provider. (${message.slice(0, 200)})`;
    }
    return `Error: ${message}`;
}
export const App = ({ initialPrompt, resume }) => {
    const { exit } = useApp();
    const startupRef = useRef(null);
    if (!startupRef.current) {
        const config = loadConfig();
        const resumed = resume ? resumeSession(resume) : undefined;
        if (resumed) {
            const provider = resumed.meta.providerId ? getProvider(resumed.meta.providerId) : undefined;
            if (provider) {
                config.providerId = provider.id;
                if (resumed.meta.model)
                    config.model = resumed.meta.model;
            }
        }
        const restored = resumed?.messages ?? [];
        const transcript = restored.length > 0
            ? restored.map((message, index) => ({
                id: index + 1,
                role: message.role,
                content: message.role === "assistant" ? stripToolCalls(message.content) : message.content,
                markdown: message.role !== "user",
            }))
            : createStartupTranscript(config);
        if (resumed) {
            const push = (text) => transcript.push({ id: transcript.length + 1, role: "system", content: text, markdown: true });
            if (resumed.meta.providerId && !getProvider(resumed.meta.providerId))
                push(`The session used provider ${resumed.meta.providerId}, which is not available in this build.`);
            push(`Resumed session: ${config.providerId}::${config.model}${resumed.rebuilt ? " (projection rebuilt)" : ""}.`);
            for (const warning of resumed.warnings)
                push(warning);
        }
        else if (!resume && loggingEnabled()) {
            const unclosed = latestUnclosedSession();
            if (unclosed) {
                transcript.push({
                    id: transcript.length + 1,
                    role: "system",
                    content: unclosedNotice(unclosed),
                    markdown: true,
                });
            }
        }
        startupRef.current = {
            config,
            transcript,
            history: restored.map((message) => ({ role: message.role, content: message.content })),
        };
    }
    const startup = startupRef.current;
    const sessionRef = useRef(null);
    if (!sessionRef.current) {
        sessionRef.current = resume
            ? openSessionLog(resume, {
                providerId: startup.config.providerId,
                model: startup.config.model,
                cwd: process.cwd(),
            })
            : createSessionLog({
                providerId: startup.config.providerId,
                model: startup.config.model,
                cwd: process.cwd(),
            });
    }
    const [, setTrustEpoch] = useState(0);
    const trusted = isTrusted(process.cwd());
    const [config, setConfig] = useState(startup.config);
    const [history, setHistory] = useState(startup.history ?? []);
    const [transcript, setTranscript] = useState(startup.transcript);
    const [streamingId, setStreamingId] = useState(null);
    const [streamingText, setStreamingText] = useState("");
    const [streamPhase, setStreamPhase] = useState("thinking");
    const [input, setInput] = useState("");
    const [pendingLogin, setPendingLogin] = useState(null);
    const [picker, setPicker] = useState(null);
    const [pickerIndex, setPickerIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const steerQueueRef = useRef([]);
    const [totalIn, setTotalIn] = useState(0);
    const [totalOut, setTotalOut] = useState(0);
    const [totalCost, setTotalCost] = useState(0);
    const [agentActivity, setAgentActivity] = useState(null);
    const idRef = useRef(startup.transcript.length);
    const abortRef = useRef(null);
    const sawDeltaRef = useRef(false);
    const lastStreamFlushRef = useRef(0);
    const ctrlCRef = useRef(0);
    const initialPromptSubmittedRef = useRef(false);
    const theme = getTheme(config.theme);
    const stableUi = useMemo(() => shouldUseStableTerminalUi(), []);
    const liveStreamingUi = useMemo(() => shouldUseLiveStreamingUi(), []);
    // The banner picks a font that fits the terminal width (see ui/Banner.ts)
    // and renders nothing when even the smallest font is too wide.
    const showBanner = transcript.length <= startup.transcript.length && !busy;
    const promptPlaceholder = pendingLogin
        ? pendingLogin.step === "provider"
            ? "Provider id (e.g. deepseek) · Esc to cancel"
            : pendingLogin.step === "model"
                ? "Model id (e.g. deepseek-chat) · Esc to cancel"
                : pendingLogin.provider && getLegacy(pendingLogin.provider)
                    ? "Paste API key (masked), or type 'keep' · Esc to cancel"
                    : "Paste API key (masked) · Esc to cancel"
        : undefined;
    const promptMask = pendingLogin?.step === "key" ? "*" : undefined;
    // Persist config whenever it changes.
    useEffect(() => {
        saveConfig(config);
    }, [config]);
    const chooseItem = useCallback((request, index) => {
        const item = request?.items?.[index];
        setPicker(null);
        if (item)
            request.onSelect(item.value, item);
    }, []);
    // Esc cancels streaming. Double Ctrl+C quits.
    useInput((inputChar, key) => {
        if (picker) {
            if (key.escape) {
                picker.onCancel?.();
                setPicker(null);
                return;
            }
            if (key.upArrow) {
                setPickerIndex((i) => Math.max(0, i - 1));
                return;
            }
            if (key.downArrow) {
                setPickerIndex((i) => Math.min(picker.items.length - 1, i + 1));
                return;
            }
            if (key.return) {
                chooseItem(picker, pickerIndex);
                return;
            }
            if (/^[1-9]$/.test(inputChar)) {
                chooseItem(picker, Number(inputChar) - 1);
                return;
            }
            return;
        }
        if (key.escape) {
            if (pendingLogin) {
                setPendingLogin(null);
                setInput("");
                pushSystem("API key entry cancelled.");
                return;
            }
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
            return;
        }
        if (key.ctrl && inputChar === "c") {
            ctrlCRef.current += 1;
            if (ctrlCRef.current >= 2) {
                exit();
            }
            else {
                pushSystem("Press Ctrl+C again to quit.");
                setTimeout(() => {
                    ctrlCRef.current = 0;
                }, 1500);
            }
        }
    });
    const pushSystem = useCallback((text) => {
        idRef.current += 1;
        sessionRef.current.append({ type: "notice", content: text });
        setTranscript((prev) => [
            ...prev,
            { id: idRef.current, role: "system", content: text, markdown: true },
        ]);
    }, []);
    const pushUser = useCallback((text, recordFact = true) => {
        idRef.current += 1;
        sessionRef.current.append(recordFact
            ? { type: "user", content: text }
            : { type: "notice", content: text });
        setTranscript((prev) => [
            ...prev,
            { id: idRef.current, role: "user", content: text, markdown: false },
        ]);
    }, []);
    const actions = useMemo(() => ({
        setProvider: (id) => setConfig((c) => ({ ...c, providerId: id })),
        setModel: (id) => setConfig((c) => ({ ...c, model: id })),
        setReasoningEffort: (effort) => setConfig((c) => ({ ...c, reasoningEffort: effort })),
        setTheme: (id) => setConfig((c) => ({ ...c, theme: id })),
        setAgentMode: (enabled) => setConfig((c) => ({ ...c, agentMode: enabled })),
        setSystemPrompt: (p) => setConfig((c) => ({ ...c, systemPrompt: p })),
        setSkillsRegistry: (url) => setConfig((c) => ({ ...c, skillsRegistry: url })),
        enableSkill: (name) => setConfig((c) => ({
            ...c,
            enabledSkills: Array.from(new Set([...(c.enabledSkills ?? []), name])),
        })),
        disableSkill: (name) => setConfig((c) => ({
            ...c,
            enabledSkills: (c.enabledSkills ?? []).filter((n) => n !== name),
        })),
        enablePlugin: (name) => setConfig((c) => ({
            ...c,
            enabledPlugins: Array.from(new Set([...(c.enabledPlugins ?? []), name])),
        })),
        disablePlugin: (name) => setConfig((c) => ({
            ...c,
            enabledPlugins: (c.enabledPlugins ?? []).filter((n) => n !== name),
        })),
        clearHistory: () => {
            setHistory([]);
            setTranscript([]);
        },
        replaceHistory: (messages) => setHistory(messages),
        cancelRun: () => {
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
        },
        steer: (text) => {
            steerQueueRef.current.push(text);
        },
        setExpanded: (value) => setExpanded(value),
        pushSystemMessage: pushSystem,
        startLogin: ({ provider, model }) => {
            setPendingLogin({
                step: provider ? (model ? "key" : "model") : "provider",
                provider,
                model,
            });
        },
    }), [pushSystem]);
    const runSlash = useCallback(async (raw) => {
        const parsed = parseSlash(raw);
        if (!parsed)
            return false;
        const cmd = findCommand(parsed.name);
        if (!cmd) {
            pushSystem(`Unknown command "/${parsed.name}". Try /help.`);
            return true;
        }
        if (busy && !["cancel", "steer", "jobs", "kill", "attach", "expand", "context"].includes(cmd.name)) {
            pushSystem(`/${cmd.name} is unavailable while a run is active. Try /cancel or /steer.`);
            return true;
        }
        // Echo the slash invocation for transcript clarity, but never echo a
        // secret: the login key is masked, while provider/model stay readable.
        const echo = parsed.name === "login" ? maskLoginEcho(parsed.args) : raw;
        pushUser(echo, false);
        try {
            const res = await cmd.run({
                args: parsed.args,
                raw: parsed.raw,
                state: {
                    providerId: config.providerId,
                    model: config.model,
                    theme: config.theme,
                    agentMode: config.agentMode,
                    history,
                    systemPrompt: config.systemPrompt,
                    totalCostUsd: totalCost,
                    totalInputTokens: totalIn,
                    totalOutputTokens: totalOut,
                    enabledSkills: config.enabledSkills,
                    enabledPlugins: config.enabledPlugins,
                    skillsRegistry: config.skillsRegistry,
                    reasoningEffort: config.reasoningEffort,
                    expanded,
                    busy,
                },
                actions,
            });
            if (res?.message)
                pushSystem(res.message);
            if (res?.picker) {
                const index = Math.max(0, res.picker.items.findIndex((item) => item.value === res.picker.current));
                setPickerIndex(index);
                setPicker(res.picker);
                setInput("");
            }
            if (res?.quit)
                exit();
        }
        catch (err) {
            pushSystem(`Command failed: ${err.message}`);
        }
        return true;
    }, [
        actions,
        config.agentMode,
        config.enabledPlugins,
        config.enabledSkills,
        config.model,
        config.providerId,
        config.skillsRegistry,
        config.systemPrompt,
        config.theme,
        busy,
        expanded,
        exit,
        history,
        pushSystem,
        pushUser,
        totalCost,
        totalIn,
        totalOut,
    ]);
    const handleSubmit = useCallback(async (raw) => {
        const text = raw.trim();
        if (!text)
            return;
        if (busy) {
            if (text.startsWith("/")) {
                await runSlash(text);
                return;
            }
            pushSystem("A run is active. Use /cancel to stop, /steer <text> to guide it, or wait.");
            return;
        }
        setInput("");
        if (text.startsWith("/")) {
            await runSlash(text);
            return;
        }
        pushUser(text);
        const provider = getProviderOrThrow(config.providerId);
        let apiKey;
        if (provider.authEnv.length > 0) {
            const lookup = resolveApiKey(provider.id, config.model, provider.authEnv);
            if (lookup.status === "unbound") {
                pushSystem(`Cannot send: your stored ${provider.label} key isn't bound to a model, so it won't be used.\n` +
                    `Re-bind it with \`/login ${provider.id} ${config.model} <key>\` (or \`/logout ${provider.id}\` to discard it).`);
                return;
            }
            if (lookup.status === "missing") {
                pushSystem(`Cannot send: no API key for ${provider.label}.\n` +
                    `Run \`/login ${provider.id} ${config.model} <key>\` (one key covers every ${provider.id} model), or set ${provider.authEnv[0]}.`);
                return;
            }
            apiKey = lookup.key;
        }
        idRef.current += 1;
        const bubbleId = idRef.current;
        setStreamingId(bubbleId);
        setStreamingText("");
        setStreamPhase("thinking");
        steerQueueRef.current = [];
        lastStreamFlushRef.current = 0;
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setBusy(true);
        let receivedDone = false;
        try {
            const maxTurns = config.agentMode ? positiveInt(config.maxAgentTurns, 24) : 1;
            const skillsBlock = buildSkillsPrompt(config.enabledSkills);
            const pluginsBlock = buildPluginsPrompt(config.enabledPlugins);
            const agentBlock = config.agentMode ? AGENT_SYSTEM_PROMPT : "";
            const fullSystem = [config.systemPrompt, skillsBlock, pluginsBlock, agentBlock]
                .filter((part) => part.trim())
                .join("\n\n");
            let compactionNotified = false;
            let lastRawFact = "";
            sawDeltaRef.current = false;
            const protocol = config.agentMode ? resolveToolProtocol(config, config.providerId, config.model) : "legacy";
            for await (const ev of runAgent({
                provider,
                apiKey,
                model: config.model,
                messages: history,
                prompt: text,
                system: fullSystem,
                maxTurns,
                allowTools: config.agentMode,
                tokenBudget: optionalBudget("FASTCODE_TOKEN_BUDGET"),
                costBudgetUsd: optionalBudget("FASTCODE_COST_BUDGET_USD"),
                signal: ctrl.signal,
                cwd: process.cwd(),
                idleTimeoutMs: config.requestIdleTimeoutMs,
                compaction: compactionConfigFromEnv(),
                reasoningEffort: config.reasoningEffort,
                protocol,
                tools: protocol === "native" ? toolSchemas() : undefined,
                onProtocolFallback: (message) => {
                    setConfig((current) => withToolCapability(current, config.providerId, config.model, "pseudo"));
                    pushSystem(message);
                },
                onNativeOk: () => {
                    if (protocol === "native")
                        setConfig((current) => withToolCapability(current, config.providerId, config.model, "native"));
                },
                takeSteering: () => {
                    const queued = steerQueueRef.current;
                    steerQueueRef.current = [];
                    return queued;
                },
                onDelta: (delta, full) => {
                    if (!sawDeltaRef.current) {
                        sawDeltaRef.current = true;
                        setStreamPhase("streaming");
                    }
                    if (!liveStreamingUi)
                        return;
                    const now = Date.now();
                    if (now - lastStreamFlushRef.current < 60)
                        return;
                    lastStreamFlushRef.current = now;
                    setStreamingText(stripToolCalls(full));
                },
            })) {
                switch (ev.type) {
                    case "compaction":
                        sessionRef.current.append({
                            type: "compacted",
                            summaryRef: ev.summaryFile,
                            source: ev.source,
                            beforeTokens: ev.beforeTokens,
                            afterTokens: ev.afterTokens,
                            droppedMessages: ev.droppedMessages,
                            keepMessages: ev.keptMessages,
                        });
                        if (!compactionNotified) {
                            compactionNotified = true;
                            pushSystem(`[context compacted] ${ev.beforeTokens} → ${ev.afterTokens} tokens (${ev.reason}); recent turns kept.` +
                                (ev.summaryFile ? `\nSummary: ${ev.summaryFile}` : ""));
                        }
                        break;
                    case "assistant_raw":
                        lastRawFact = ev.text;
                        sessionRef.current.append({ type: "assistant_raw", content: ev.text, toolCalls: ev.toolCalls });
                        break;
                    case "assistant_text":
                        pushSystem(ev.text);
                        break;
                    case "tool_call":
                        sessionRef.current.append({ type: "tool_call", id: ev.id, tool: ev.call.tool, args: ev.call, native: Boolean(ev.native) });
                        setStreamPhase("tool");
                        setAgentActivity(`Coding: ${ev.call.tool}`);
                        pushSystem(`Running tool: \`${ev.call.tool}\`\n\n\`\`\`json\n${JSON.stringify(ev.call, null, 2)}\n\`\`\``);
                        break;
                    case "tool_result": {
                        sessionRef.current.append({
                            type: "tool_result",
                            id: ev.id,
                            tool: ev.call.tool,
                            ok: ev.ok,
                            output: ev.output,
                            sideEffects: ev.sideEffects,
                        });
                        const collapsed = stableUi && !expanded;
                        const body = collapsed ? collapseToolOutput(ev.output) : ev.output;
                        const hint = collapsed ? "\n\n_(output collapsed; /expand to show full output)_" : "";
                        pushSystem(`Tool ${ev.ok ? "completed" : "failed"}: \`${ev.call.tool}\`\n\n\`\`\`\n${body}\n\`\`\`${hint}`);
                        break;
                    }
                    case "usage":
                        if (ev.usage.inputTokens)
                            setTotalIn((n) => n + (ev.usage.inputTokens ?? 0));
                        if (ev.usage.outputTokens)
                            setTotalOut((n) => n + (ev.usage.outputTokens ?? 0));
                        if (ev.usage.costUsd)
                            setTotalCost((n) => n + (ev.usage.costUsd ?? 0));
                        break;
                    case "loop_detected":
                        pushSystem(`Loop detected: \`${ev.fingerprint.split(":")[0]}\` repeated ${ev.occurrences} times. Asking the model to change approach.`);
                        break;
                    case "notice":
                        pushSystem(ev.text);
                        break;
                    case "checkpoint":
                        sessionRef.current.append({
                            type: "checkpoint",
                            turn: ev.turn,
                            cwd: ev.cwd,
                            providerId: ev.providerId,
                            model: ev.model,
                            activeFiles: ev.activeFiles,
                            lastFactSeq: sessionRef.current.count(),
                        });
                        break;
                    case "error":
                        if (ev.kind === "aborted")
                            pushSystem("Cancelled.");
                        else if (ev.kind === "stream_error")
                            pushSystem(streamErrorMessage(ev.message, provider, config.model));
                        else
                            pushSystem(ev.message);
                        break;
                    case "done":
                        receivedDone = true;
                        setHistory(ev.history);
                        if (ev.finalText) {
                            idRef.current += 1;
                            const finalId = idRef.current;
                            if (ev.finalText !== lastRawFact)
                                sessionRef.current.append({ type: "assistant_raw", content: ev.finalText });
                            setTranscript((prev) => [
                                ...prev,
                                { id: finalId, role: "assistant", content: ev.finalText, markdown: true },
                            ]);
                        }
                        break;
                }
            }
        }
        catch (err) {
            if (!receivedDone)
                setHistory([...history, { role: "user", content: text }]);
            pushSystem(`Error: ${String(err?.message ?? err)}`);
        }
        finally {
            setStreamingId(null);
            setStreamingText("");
            setAgentActivity(null);
            setStreamPhase("thinking");
            setBusy(false);
            abortRef.current = null;
        }
    }, [
        busy,
        config.agentMode,
        config.enabledSkills,
        config.enabledPlugins,
        config.model,
        config.providerId,
        config.systemPrompt,
        history,
        pushSystem,
        pushUser,
        runSlash,
    ]);
    // Guided `/login`: provider → model → key. Text prompts only; the key step
    // is masked. `keep` re-binds an existing unbound (legacy) key to a model.
    const handleWizardSubmit = useCallback(async (raw) => {
        const value = raw.trim();
        setInput("");
        if (!value || !pendingLogin)
            return;
        if (pendingLogin.step === "provider") {
            const provider = getProvider(value);
            if (!provider) {
                pushSystem(`Unknown provider "${value}". Available: ${PROVIDERS.map((p) => p.id).join(", ")}`);
                return;
            }
            if (provider.authEnv.length === 0) {
                pushSystem(`${provider.label} doesn't require an API key. Nothing to save.`);
                setPendingLogin(null);
                return;
            }
            setPendingLogin({ step: "model", provider: provider.id });
            const models = await provider.listModels(undefined).catch(() => []);
            const names = models.slice(0, 8).map((m) => m.id).join(", ");
            pushSystem(`Provider: ${provider.label} (${provider.id}).\n` +
                `Type the model id to bind this key to — e.g. \`${provider.defaultModel}\`.` +
                (names ? `\n  known models: ${names}` : ""));
            return;
        }
        if (pendingLogin.step === "model") {
            const provider = getProvider(pendingLogin.provider);
            if (!provider) {
                setPendingLogin(null);
                return;
            }
            setPendingLogin({ step: "key", provider: provider.id, model: value });
            pushSystem(`Saved from model: ${provider.id} · ${value}.\n` +
                `This key will be reused by every ${provider.label} model.\n` +
                `Paste the API key (input is masked).` +
                (getLegacy(provider.id) ? `\nOr type \`keep\` to re-bind the stored ${provider.label} key.` : ""));
            return;
        }
        const provider = getProvider(pendingLogin.provider);
        if (!provider) {
            setPendingLogin(null);
            return;
        }
        let key = value;
        if (value.toLowerCase() === "keep") {
            const legacy = getLegacy(provider.id);
            if (!legacy) {
                pushSystem(`No stored ${provider.label} key to reuse — paste the key instead.`);
                return;
            }
            key = legacy;
        }
        pushSystem(saveScopedKey(provider.id, provider.label, pendingLogin.model, key));
        setPendingLogin(null);
    }, [pendingLogin, pushSystem]);
    useEffect(() => {
        if (!initialPrompt || initialPromptSubmittedRef.current)
            return;
        initialPromptSubmittedRef.current = true;
        const t = setTimeout(() => void handleSubmit(initialPrompt), 50);
        return () => clearTimeout(t);
    }, [handleSubmit, initialPrompt]);
    useEffect(() => () => {
        shutdownShells();
        if (sessionRef.current)
            sessionRef.current.close();
    }, []);
    if (config.agentMode && !trusted) {
        const decide = (allow) => {
            if (allow) {
                trustProject(process.cwd());
            }
            else {
                setConfig((c) => ({ ...c, agentMode: false }));
                pushSystem("Trust declined: agent tools are off for this session (chat only).");
            }
            setTrustEpoch((n) => n + 1);
        };
        return _jsx(TrustGate, { theme: theme, cwd: process.cwd(), onDecision: decide });
    }
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, children: [showBanner ? _jsx(Banner, { theme: theme, stable: stableUi }) : null, _jsx(Static, { items: transcript, children: (entry) => (_jsx(Box, { marginTop: 1, children: _jsx(MessageBubble, { theme: theme, role: entry.role, content: entry.content, markdown: entry.markdown }) }, entry.id)) }), streamingId !== null && liveStreamingUi ? (_jsx(Box, { marginTop: 1, flexDirection: "column", children: _jsx(MessageBubble, { theme: theme, role: "assistant", content: streamingTail(streamingText, 6), markdown: false, streaming: true }) })) : null, _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [busy ? (_jsx(Box, { marginBottom: 1, children: _jsx(Spinner, { theme: theme, label: agentActivity ?? (streamPhase === "streaming" ? "Streaming" : streamPhase === "tool" ? "Waiting for tool" : "Thinking"), stable: stableUi }) })) : null, picker ? _jsx(Picker, { theme: theme, title: picker.title, items: picker.items, index: pickerIndex, current: picker.current }) : _jsx(Prompt, { theme: theme, value: input, onChange: setInput, onSubmit: pendingLogin ? handleWizardSubmit : handleSubmit, disabled: false, placeholder: promptPlaceholder, mask: promptMask }), _jsx(StatusBar, { theme: theme, providerId: config.providerId, model: config.model, inputTokens: totalIn, outputTokens: totalOut, costUsd: totalCost, enabledSkillCount: config.enabledSkills.length + config.enabledPlugins.length, reasoningEffort: config.reasoningEffort }), _jsxs(Text, { color: theme.muted, children: [COMMANDS.length, " commands \u00B7 ", config.enabledSkills.length, " skill(s) active"] })] })] }));
};
