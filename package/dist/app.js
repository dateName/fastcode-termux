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
import { AGENT_SYSTEM_PROMPT, formatToolResults, parseToolCalls, stripToolCalls, } from "./agent/protocol.js";
import { runAgentTool } from "./agent/tools.js";
import { Banner } from "./ui/Banner.js";
import { Spinner } from "./ui/Spinner.js";
import { StatusBar } from "./ui/StatusBar.js";
import { MessageBubble } from "./ui/Message.js";
import { Prompt } from "./ui/Prompt.js";
import { COMMANDS, findCommand, parseSlash } from "./commands/index.js";
import { getProviderOrThrow } from "./providers/index.js";
import { loadConfig, saveConfig, resolveApiKey, } from "./config/store.js";
import { getTheme } from "./config/themes.js";
import { createStartupTranscript } from "./lib/startup.js";
import { shouldUseLiveStreamingUi, shouldUseStableTerminalUi } from "./lib/uiMode.js";
import { buildPluginsPrompt } from "./plugins/manager.js";
import { buildSkillsPrompt } from "./skills/manager.js";
import { createSessionLog, loadSessionMessages, openSessionLog } from "./session/log.js";
import { isTrusted, trustProject } from "./config/trust.js";
import { TrustGate } from "./ui/TrustGate.js";
export const App = ({ initialPrompt, resume }) => {
    const { exit } = useApp();
    const startupRef = useRef(null);
    if (!startupRef.current) {
        const config = loadConfig();
        const restored = resume ? loadSessionMessages(resume) : [];
        startupRef.current = {
            config,
            transcript: restored.length > 0
                ? restored.map((message, index) => ({
                    id: index + 1,
                    role: message.role,
                    content: message.content,
                    markdown: message.role !== "user",
                }))
                : createStartupTranscript(config),
            history: restored.map((message) => ({ role: message.role, content: message.content })),
        };
    }
    const startup = startupRef.current;
    const sessionRef = useRef(null);
    if (!sessionRef.current) {
        sessionRef.current = resume
            ? openSessionLog(resume)
            : createSessionLog({
                providerId: startup.config.providerId,
                model: startup.config.model,
                cwd: process.cwd(),
            });
    }
    const [trusted, setTrusted] = useState(() => isTrusted(process.cwd()));
    const [config, setConfig] = useState(startup.config);
    const [history, setHistory] = useState(startup.history ?? []);
    const [transcript, setTranscript] = useState(startup.transcript);
    const [streamingId, setStreamingId] = useState(null);
    const [streamingText, setStreamingText] = useState("");
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [totalIn, setTotalIn] = useState(0);
    const [totalOut, setTotalOut] = useState(0);
    const [totalCost, setTotalCost] = useState(0);
    const [agentActivity, setAgentActivity] = useState(null);
    const idRef = useRef(startup.transcript.length);
    const abortRef = useRef(null);
    const ctrlCRef = useRef(0);
    const initialPromptSubmittedRef = useRef(false);
    const theme = getTheme(config.theme);
    const stableUi = useMemo(() => shouldUseStableTerminalUi(), []);
    const liveStreamingUi = useMemo(() => shouldUseLiveStreamingUi(), []);
    // The banner picks a font that fits the terminal width (see ui/Banner.ts)
    // and renders nothing when even the smallest font is too wide.
    const showBanner = transcript.length <= startup.transcript.length && !busy;
    // Persist config whenever it changes.
    useEffect(() => {
        saveConfig(config);
    }, [config]);
    // Esc cancels streaming. Double Ctrl+C quits.
    useInput((inputChar, key) => {
        if (key.escape) {
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
        sessionRef.current.append({ type: "message", role: "system", content: text });
        setTranscript((prev) => [
            ...prev,
            { id: idRef.current, role: "system", content: text, markdown: true },
        ]);
    }, []);
    const pushUser = useCallback((text) => {
        idRef.current += 1;
        sessionRef.current.append({ type: "message", role: "user", content: text });
        setTranscript((prev) => [
            ...prev,
            { id: idRef.current, role: "user", content: text, markdown: false },
        ]);
    }, []);
    const actions = useMemo(() => ({
        setProvider: (id) => setConfig((c) => ({ ...c, providerId: id })),
        setModel: (id) => setConfig((c) => ({ ...c, model: id })),
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
        pushSystemMessage: pushSystem,
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
        // Echo the slash invocation for transcript clarity, but never echo a
        // secret: "/login <provider> <key>" would otherwise print the API key.
        const echo = parsed.name === "login" && parsed.args.length >= 2
            ? `/login ${parsed.args[0]} ${"*".repeat(8)}`
            : raw;
        pushUser(echo);
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
                },
                actions,
            });
            if (res?.message)
                pushSystem(res.message);
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
        if (!text || busy)
            return;
        setInput("");
        if (text.startsWith("/")) {
            await runSlash(text);
            return;
        }
        pushUser(text);
        const provider = getProviderOrThrow(config.providerId);
        const apiKey = resolveApiKey(provider.id, provider.authEnv);
        if (!apiKey && provider.authEnv.length > 0) {
            pushSystem(`Cannot send: no API key for ${provider.label}. Run \`/login ${provider.id} <key>\`.`);
            return;
        }
        const nextHistory = [...history, { role: "user", content: text }];
        setHistory(nextHistory);
        idRef.current += 1;
        const bubbleId = idRef.current;
        setStreamingId(bubbleId);
        setStreamingText("");
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setBusy(true);
        try {
            let workingHistory = nextHistory;
            let finalText = "";
            for (let turn = 0; turn < (config.agentMode ? 8 : 1); turn += 1) {
                const skillsBlock = buildSkillsPrompt(config.enabledSkills);
                const pluginsBlock = buildPluginsPrompt(config.enabledPlugins);
                const agentBlock = config.agentMode ? AGENT_SYSTEM_PROMPT : "";
                const fullSystem = [config.systemPrompt, skillsBlock, pluginsBlock, agentBlock]
                    .filter((part) => part.trim())
                    .join("\n\n");
                let acc = "";
                for await (const chunk of provider.stream({
                    model: config.model,
                    messages: workingHistory,
                    system: fullSystem,
                    signal: ctrl.signal,
                }, apiKey)) {
                    if (chunk.delta) {
                        acc += chunk.delta;
                        if (liveStreamingUi)
                            setStreamingText(stripToolCalls(acc));
                    }
                    if (chunk.done) {
                        if (chunk.usage?.inputTokens)
                            setTotalIn((n) => n + (chunk.usage.inputTokens ?? 0));
                        if (chunk.usage?.outputTokens)
                            setTotalOut((n) => n + (chunk.usage.outputTokens ?? 0));
                        if (chunk.usage?.costUsd)
                            setTotalCost((n) => n + (chunk.usage.costUsd ?? 0));
                    }
                }
                const visibleText = stripToolCalls(acc);
                const calls = config.agentMode ? parseToolCalls(acc) : [];
                if (calls.length === 0) {
                    finalText = visibleText || acc;
                    break;
                }
                if (visibleText)
                    pushSystem(visibleText);
                const results = [];
                for (const call of calls) {
                    setAgentActivity(`Coding: ${call.tool}`);
                    pushSystem(`Running tool: \`${call.tool}\`\n\n\`\`\`json\n${JSON.stringify(call, null, 2)}\n\`\`\``);
                    const result = await runAgentTool(call, process.cwd());
                    results.push({ call, ...result });
                    pushSystem(`Tool ${result.ok ? "completed" : "failed"}: \`${call.tool}\`\n\n\`\`\`\n${result.output}\n\`\`\``);
                }
                const toolMessage = formatToolResults(results);
                workingHistory = [
                    ...workingHistory,
                    { role: "assistant", content: acc },
                    { role: "user", content: toolMessage },
                ];
                setHistory(workingHistory);
                setStreamingText("");
                setAgentActivity(null);
            }
            if (!finalText) {
                finalText = "Stopped after running the maximum number of agent tool turns.";
            }
            setHistory([...workingHistory, { role: "assistant", content: finalText }]);
            idRef.current = Math.max(idRef.current, bubbleId);
            sessionRef.current.append({ type: "message", role: "assistant", content: finalText });
            setTranscript((prev) => [
                ...prev,
                { id: bubbleId, role: "assistant", content: finalText, markdown: true },
            ]);
        }
        catch (err) {
            if (err.name === "AbortError") {
                pushSystem("Cancelled.");
            }
            else {
                pushSystem(`Error: ${err.message}`);
            }
        }
        finally {
            setStreamingId(null);
            setStreamingText("");
            setAgentActivity(null);
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
    useEffect(() => {
        if (!initialPrompt || initialPromptSubmittedRef.current)
            return;
        initialPromptSubmittedRef.current = true;
        const t = setTimeout(() => void handleSubmit(initialPrompt), 50);
        return () => clearTimeout(t);
    }, [handleSubmit, initialPrompt]);
    useEffect(() => () => {
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
            setTrusted(true);
        };
        return _jsx(TrustGate, { theme: theme, cwd: process.cwd(), onDecision: decide });
    }
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, children: [showBanner ? _jsx(Banner, { theme: theme, stable: stableUi }) : null, _jsx(Static, { items: transcript, children: (entry) => (_jsx(Box, { marginTop: 1, children: _jsx(MessageBubble, { theme: theme, role: entry.role, content: entry.content, markdown: entry.markdown }) }, entry.id)) }), streamingId !== null && liveStreamingUi ? (_jsx(Box, { marginTop: 1, flexDirection: "column", children: _jsx(MessageBubble, { theme: theme, role: "assistant", content: streamingText, markdown: true, streaming: true }) })) : null, _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [busy ? (_jsx(Box, { marginBottom: 1, children: _jsx(Spinner, { theme: theme, label: agentActivity ?? (streamingId !== null ? "Streaming" : "Thinking"), stable: stableUi && !agentActivity }) })) : null, _jsx(Prompt, { theme: theme, value: input, onChange: setInput, onSubmit: handleSubmit, disabled: busy, stable: stableUi }), _jsx(StatusBar, { theme: theme, providerId: config.providerId, model: config.model, inputTokens: totalIn, outputTokens: totalOut, costUsd: totalCost, enabledSkillCount: config.enabledSkills.length + config.enabledPlugins.length }), _jsxs(Text, { color: theme.muted, children: [COMMANDS.length, " commands \u00B7 ", config.enabledSkills.length, " skill(s) active"] })] })] }));
};
