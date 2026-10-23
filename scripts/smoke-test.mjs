#!/usr/bin/env node
/**
 * FastCode smoke test — structural and behavioural checks on the compiled package.
 * Usage (from the project root):  node scripts/smoke-test.mjs
 */
import { readdirSync, mkdtempSync, rmSync, symlinkSync, existsSync, writeFileSync, readFileSync, chmodSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..", "package");
const distDir = join(pkgDir, "dist");
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
    if (cond) {
        pass += 1;
        console.log("  PASS  " + name);
    }
    else {
        fail += 1;
        console.log("  FAIL  " + name + (detail ? "  -- " + detail : ""));
    }
}
function listJs(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory())
            out.push(...listJs(p));
        else if (e.name.endsWith(".js"))
            out.push(p);
    }
    return out;
}
const load = (rel) => import(pathToFileURL(join(distDir, rel)).href);

console.log("FastCode smoke test");
console.log("  package: " + pkgDir);
// config/paths caches its root on first use, and the agent tools now import
// the config store, so the sandbox home must be set before any module loads.
process.env.FASTCODE_HOME = mkdtempSync(join(tmpdir(), "fastcode-home-"));

const jsFiles = listJs(distDir);
let syntaxBad = 0;
for (const f of jsFiles) {
    try {
        execFileSync(process.execPath, ["--check", f], { cwd: pkgDir, stdio: ["ignore", "pipe", "pipe"] });
    }
    catch {
        syntaxBad += 1;
    }
}
ok("syntax of " + jsFiles.length + " dist files", syntaxBad === 0, syntaxBad + " failed");

const providers = await load("providers/index.js");
ok("at least 13 providers registered", providers.PROVIDERS.length >= 13, "count=" + providers.PROVIDERS.length);
ok("every provider exposes id/label/defaultModel/stream", providers.PROVIDERS.every((p) => typeof p.id === "string" && typeof p.label === "string" && typeof p.defaultModel === "string" && typeof p.stream === "function"));

const http = await load("lib/http.js");
async function sse(chunks) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
        start(c) {
            for (const ch of chunks)
                c.enqueue(enc.encode(ch));
            c.close();
        },
    });
    const res = new Response(stream, { status: 200 });
    const evs = [];
    for await (const ev of http.streamSSE(res))
        evs.push(ev.data);
    return evs;
}
const crlfEvents = await sse(["data: one" + CRLF + CRLF + "data: two" + CRLF + CRLF]);
ok("SSE parses CRLF frames", crlfEvents.length === 2 && crlfEvents[0] === "one" && crlfEvents[1] === "two", JSON.stringify(crlfEvents));
const lfEvents = await sse(["data: a" + LF + LF + "data: b" + LF + LF]);
ok("SSE still parses LF frames", lfEvents.length === 2, JSON.stringify(lfEvents));

const utf8Frame = "data: 中文🙂" + LF + LF;
const utf8Bytes = new TextEncoder().encode(utf8Frame);
const utf8Stream = new ReadableStream({
    start(controller) {
        for (const byte of utf8Bytes)
            controller.enqueue(Uint8Array.of(byte));
        controller.close();
    },
});
const utf8Events = [];
for await (const event of http.streamSSE(new Response(utf8Stream, { status: 200 })))
    utf8Events.push(event);
ok("single-byte UTF-8 splits reassemble without replacement chars", utf8Events.length === 1 &&
    utf8Events[0].data === "中文🙂" && !utf8Events[0].data.includes("\uFFFD"), JSON.stringify(utf8Events));

const stallStream = new ReadableStream({
    start(controller) {
        controller.enqueue(new TextEncoder().encode("data: one" + LF + LF));
    },
});
const stallEvents = [];
let stallError;
try {
    for await (const event of http.streamSSE(new Response(stallStream, { status: 200 }), { idleTimeoutMs: 40 }))
        stallEvents.push(event);
}
catch (err) {
    stallError = err;
}
ok("#37 SSE idle timeout raises NetworkStallError after partial events", stallError?.name === "NetworkStallError" &&
    stallEvents.length === 1 && /idle timeout/.test(stallError.message), stallError?.message);

const streamModule = await load("agent/stream.js");
const stallingProvider = {
    id: "mock",
    label: "Mock",
    authEnv: [],
    baseUrl: "",
    defaultModel: "mock",
    listModels: async () => [],
    async *stream() {
        yield { delta: "part", done: false };
        throw new http.NetworkStallError("stall after partial output");
    },
};
let partialError;
try {
    await streamModule.runStream(stallingProvider, { model: "mock", messages: [] }, undefined, { maxRetries: 0 });
}
catch (err) {
    partialError = err;
}
ok("SSE stall keeps accumulated text on the error", partialError?.name === "NetworkStallError" && partialError.partialText === "part");

const netModule = await load("lib/net.js");
let retryAttempts = 0;
const retriedValue = await netModule.retryRequest(async () => {
    retryAttempts += 1;
    if (retryAttempts < 3)
        throw new Error("429 rate limit");
    return "ok";
}, { retries: 3, backoffMs: [0, 0, 0] });
ok("retryRequest retries transient failures", retriedValue === "ok" && retryAttempts === 3);
let quotaAttempts = 0;
let quotaError;
try {
    await netModule.retryRequest(async () => {
        quotaAttempts += 1;
        throw new Error("429 quota exhausted");
    }, { retries: 3, backoffMs: [0, 0, 0] });
}
catch (err) {
    quotaError = err;
}
ok("retryRequest raises QuotaError after exhausting 429s", quotaError instanceof netModule.QuotaError && quotaAttempts === 3);

const requestIds = [];
let flakyCalls = 0;
const flakyProvider = {
    id: "mock",
    label: "Mock",
    authEnv: [],
    baseUrl: "",
    defaultModel: "mock",
    listModels: async () => [],
    async *stream(req) {
        requestIds.push(req.clientRequestId);
        flakyCalls += 1;
        if (flakyCalls === 1) {
            yield { delta: "hello ", done: false };
            throw new Error("ECONNRESET");
        }
        yield { delta: "hello ", done: false };
        yield { delta: "world", done: true };
    },
};
const cumulative = [];
const retriedStream = await streamModule.runStream(flakyProvider, { model: "mock", messages: [] }, undefined, {
    maxRetries: 1,
    retryBackoffMs: [0],
    onDelta: (_delta, text) => cumulative.push(text),
});
ok("#41 stream retry dedupes the replay prefix", retriedStream.text === "hello world" && retriedStream.retried === 1 &&
    cumulative.at(-1) === "hello world" && !retriedStream.text.includes("hello hello"), retriedStream.text);
ok("retried requests reuse one clientRequestId", requestIds.length === 2 && requestIds[0] === requestIds[1] && Boolean(requestIds[0]), JSON.stringify(requestIds));

let divergentCalls = 0;
let resetCount = 0;
const divergentProvider = {
    id: "mock",
    label: "Mock",
    authEnv: [],
    baseUrl: "",
    defaultModel: "mock",
    listModels: async () => [],
    async *stream() {
        divergentCalls += 1;
        if (divergentCalls === 1) {
            yield { delta: "old text", done: false };
            throw new Error("ECONNRESET");
        }
        yield { delta: "new answer", done: true };
    },
};
const divergent = await streamModule.runStream(divergentProvider, { model: "mock", messages: [] }, undefined, {
    maxRetries: 1,
    retryBackoffMs: [0],
    onReset: () => { resetCount += 1; },
});
ok("#42 divergent retry replaces instead of concatenating", divergent.text === "new answer" && divergentCalls === 2 && resetCount === 1, divergent.text);

const stallServer = createServer(() => {
    // Deliberately never responds.
});
await new Promise((resolve) => stallServer.listen(0, "127.0.0.1", resolve));
const stallPort = stallServer.address().port;
const probeStarted = Date.now();
const probeOk = await http.probeConnectivity("http://127.0.0.1:" + stallPort, 300);
const probeElapsed = Date.now() - probeStarted;
stallServer.closeAllConnections?.();
await new Promise((resolve) => stallServer.close(resolve));
ok("#38 probeConnectivity returns false within 3s", probeOk === false && probeElapsed < 3000, probeElapsed + "ms");

const protocol = await load("agent/protocol.js");
const dsmlBlock = "<｜DSML｜｜calls>\n<｜DSML｜invoke name=\"shell\">\n<｜DSML｜parameter name=\"command\" string=\"true\">echo hi</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜｜calls>";
const dsmlParsed = protocol.parseToolCalls("noise " + dsmlBlock);
ok("parses the DeepSeek DSML tool-call dialect", dsmlParsed.length === 1 && dsmlParsed[0].tool === "shell" && dsmlParsed[0].command === "echo hi", JSON.stringify(dsmlParsed));
const dsmlStripped = protocol.stripToolCalls("hello " + dsmlBlock + " world");
ok("strips DSML markup from visible text", !/DSML/.test(dsmlStripped) && dsmlStripped.includes("hello") && dsmlStripped.includes("world"), JSON.stringify(dsmlStripped));
const jsonParsed = protocol.parseToolCalls('<fastcode_tool>{"tool":"pwd"}</fastcode_tool>');
ok("still parses <fastcode_tool> JSON", jsonParsed.length === 1 && jsonParsed[0].tool === "pwd", JSON.stringify(jsonParsed));

const agentTools = await load("agent/tools.js");
const tmp = mkdtempSync(join(tmpdir(), "fastcode-smoke-"));
writeFileSync(join(tmp, "a.txt"), "hello needle" + LF, "utf8");
let danglingMade = false;
try {
    symlinkSync(join(tmp, "missing-target"), join(tmp, "dangling"), "dir");
    danglingMade = true;
}
catch {
    // Windows without symlink privilege: skip that part of the fixture.
}
const grep = await agentTools.runAgentTool({ tool: "grep", pattern: "needle", path: ".", maxDepth: 2 }, tmp);
ok("grep succeeds" + (danglingMade ? " with a dangling symlink present" : ""), grep.ok === true, grep.output);
ok("grep finds the file", grep.output.includes("a.txt"), grep.output);
const escape = await agentTools.runAgentTool({ tool: "read_file", path: "../../etc/passwd" }, tmp);
ok("sandbox rejects a lexical path escape", escape.ok === false && escape.output.includes("outside sandbox"), escape.output);
const outsideDir = mkdtempSync(join(tmpdir(), "fastcode-outside-"));
writeFileSync(join(outsideDir, "secret.txt"), "secret" + LF, "utf8");
let escapeLink = false;
try {
    symlinkSync(outsideDir, join(tmp, "escape"), "dir");
    escapeLink = true;
}
catch {
    // Windows without symlink privilege: skip this case.
}
if (escapeLink) {
    const viaLink = await agentTools.runAgentTool({ tool: "read_file", path: "escape/secret.txt" }, tmp);
    ok("sandbox blocks a symlink that leaves the root", viaLink.ok === false, viaLink.output);
    const written = await agentTools.runAgentTool({ tool: "write_file", path: "escape/evil.txt", content: "x" }, tmp);
    ok("sandbox blocks writes through that symlink", written.ok === false && !existsSync(join(outsideDir, "evil.txt")), written.output);
}
const extraDir = mkdtempSync(join(tmpdir(), "fastcode-extra-"));
writeFileSync(join(extraDir, "allowed.txt"), "needle extra" + LF, "utf8");
const blockedByDefault = await agentTools.runAgentTool({ tool: "read_file", path: join(extraDir, "allowed.txt") }, tmp);
ok("a path outside every allowed root is blocked", blockedByDefault.ok === false, blockedByDefault.output);
process.env.FASTCODE_ALLOW_PATHS = extraDir;
const allowedNow = await agentTools.runAgentTool({ tool: "read_file", path: join(extraDir, "allowed.txt") }, tmp);
ok("FASTCODE_ALLOW_PATHS grants an extra root", allowedNow.ok === true, allowedNow.output);
delete process.env.FASTCODE_ALLOW_PATHS;
rmSync(tmp, { recursive: true, force: true });
rmSync(outsideDir, { recursive: true, force: true });
rmSync(extraDir, { recursive: true, force: true });

const store = await load("config/store.js");
const paths = await load("config/paths.js");
const cfg = store.loadConfig();
store.saveConfig({ ...cfg, providerId: "deepseek", model: "deepseek-chat" });
ok("saveConfig writes config.json", existsSync(paths.getPaths().config));
ok("config and keys stay in separate files", !existsSync(paths.getPaths().auth));

// API keys are provider-scoped: every model of a provider reuses one key.
store.setCredential("deepseek", "deepseek-chat", "sk-1234567890abcd");
ok("a provider key resolves for its own model", store.resolveApiKey("deepseek", "deepseek-chat", []).status === "ok");
ok("the same provider key resolves for another model", store.resolveApiKey("deepseek", "deepseek-reasoner", []).status === "ok");
process.env.DEEPSEEK_API_KEY = "sk-fromenv";
ok("env var is a provider-wide fallback", store.resolveApiKey("deepseek", "deepseek-reasoner", ["DEEPSEEK_API_KEY"]).status === "ok");
delete process.env.DEEPSEEK_API_KEY;
ok("maskKey hides the middle", store.maskKey("sk-1234567890abcd") === "sk-****abcd");
writeFileSync(paths.getPaths().auth, JSON.stringify({ keys: { openai: "sk-legacy-0000wxyz" } }));
ok("a legacy provider-only key migrates to a provider key", store.resolveApiKey("openai", "gpt-4o", []).status === "ok");
store.setCredential("openai", "gpt-4o", "sk-new-1234efgh");
ok("provider-scoped keys do not use the legacy field", store.listLegacy().length === 0);

const slog = await load("session/log.js");
const session = slog.createSessionLog({ providerId: "deepseek" });
session.append({ type: "message", role: "user", content: "hi" });
session.close();
const sessions = slog.listSessions();
ok("session log writes JSONL and lists it", sessions.length === 1 && sessions[0].messages === 1, JSON.stringify(sessions));
ok("session log can be replayed", (slog.loadSessionMessages(sessions[0].file)[0] ?? {}).content === "hi");

const trust = await load("config/trust.js");
ok("a fresh folder is not trusted", trust.isTrusted(process.cwd()) === false);
trust.trustProject(process.cwd());
ok("trustProject persists and reads back", trust.isTrusted(process.cwd()) === true);
trust.untrustProject(process.cwd());
ok("untrustProject revokes trust", trust.isTrusted(process.cwd()) === false);

const guards = await load("agent/guards.js");
ok("dangerous command is blocked", guards.evaluateShellCommand("rm -rf /").allow === false);
ok("normal command is allowed", guards.evaluateShellCommand("npm test").allow === true);
ok("git --format is not a false positive", guards.evaluateShellCommand("git log --format=%H").allow === true);
process.env.FASTCODE_ALLOW_DANGEROUS = "1";
ok("FASTCODE_ALLOW_DANGEROUS bypasses the guard", guards.evaluateShellCommand("rm -rf /").allow === true);
delete process.env.FASTCODE_ALLOW_DANGEROUS;

const limits = await load("agent/limits.js");
const tail = limits.createOutputBuffer(8, "tail");
tail.push("abcdefghijkl");
ok("output buffer keeps only the last N characters", tail.value().includes("efghijkl") && tail.value().includes("omitted"), tail.value());

const modelMeta = await load("lib/model-meta.js");
const covered = providers.PROVIDERS.every((p) => {
    const meta = modelMeta.getModelMeta(p.id, p.defaultModel);
    return meta.contextWindow > 0 && meta.charsPerToken > 0;
});
ok("model-meta covers all " + providers.PROVIDERS.length + " provider default models", covered);
const unknownMeta = modelMeta.getModelMeta("not-a-provider", "not-a-model");
ok("unknown models fall back conservatively", unknownMeta.contextWindow === 32768 && unknownMeta.charsPerToken === 2.5, JSON.stringify(unknownMeta));
const cjkTokens = modelMeta.estTokens("x".repeat(100), { providerId: "deepseek", model: "deepseek-v4-pro" });
const latinTokens = modelMeta.estTokens("x".repeat(100), { providerId: "openai", model: "gpt-4.1" });
ok("estTokens uses the model chars/token ratio", cjkTokens > latinTokens, cjkTokens + " vs " + latinTokens);
writeFileSync(join(process.env.FASTCODE_HOME, "model-meta.json"), JSON.stringify({ "deepseek/deepseek-v4-pro": { contextWindow: 4096, charsPerToken: 1 } }));
modelMeta.clearModelMetaCache();
ok("user model-meta.json overrides the built-in table", modelMeta.getModelMeta("deepseek", "deepseek-v4-pro").contextWindow === 4096);
rmSync(join(process.env.FASTCODE_HOME, "model-meta.json"), { force: true });
modelMeta.clearModelMetaCache();

ok("read-only compound commands are recognized", guards.isReadOnlyCommand("git status && ls | head") === true);
ok("one side-effecting segment taints the whole command", guards.isReadOnlyCommand("ls && rm -rf x") === false && guards.isReadOnlyCommand("ls | xargs rm") === false);
ok("tool calls classify by effect, not by name alone", guards.isReadOnlyToolCall({ tool: "read_file" }) === true && guards.isReadOnlyToolCall({ tool: "shell", command: "touch x" }) === false);
const stage0 = mkdtempSync(join(tmpdir(), "fastcode-stage0-"));
writeFileSync(join(stage0, "a.txt"), "hello" + LF, "utf8");
ok("fingerprints ignore timeoutMs and normalize paths", guards.toolCallFingerprint({ tool: "read_file", path: "./a.txt", timeoutMs: 1 }, stage0) ===
    guards.toolCallFingerprint({ tool: "read_file", path: join(stage0, "a.txt") }, stage0));

const runner = await load("agent/runner.js");
function scriptedProvider(steps) {
    return {
        id: "mock",
        label: "Mock",
        authEnv: [],
        baseUrl: "",
        defaultModel: "mock",
        listModels: async () => [],
        async *stream(_req) {
            const step = steps.shift() ?? { text: "" };
            if (step.delay)
                await new Promise((resolve) => setTimeout(resolve, step.delay));
            if (step.text)
                yield { delta: step.text, done: false };
            yield { delta: "", done: true, usage: step.usage, ...(step.toolCalls ? { toolCalls: step.toolCalls } : {}) };
        },
    };
}
async function collect(gen) {
    const events = [];
    for await (const event of gen)
        events.push(event);
    return events;
}
const runnerSource = readFileSync(join(distDir, "agent", "runner.js"), "utf8");
ok("runner has no React dependency", !/["']react(-|\/|["'])/.test(runnerSource));

const twoTurn = await collect(runner.runAgent({
    provider: scriptedProvider([
        { text: 'Before.<fastcode_tool>{"tool":"pwd"}</fastcode_tool>' },
        { text: "Done." },
    ]),
    model: "mock",
    prompt: "hi",
    maxTurns: 5,
    cwd: stage0,
}));
const twoTurnTypes = twoTurn.map((event) => event.type).join(",");
ok("#32 runner completes 2 turns without React", twoTurnTypes === "assistant_raw,assistant_text,tool_call,tool_result,checkpoint,assistant_raw,checkpoint,done" &&
    twoTurn.at(-1).stopReason === "complete" && twoTurn.at(-1).history.length === 4, twoTurnTypes);

const abortController = new AbortController();
const aborted = await collect(runner.runAgent({
    provider: scriptedProvider([{ text: "partial text", delay: 5 }]),
    model: "mock",
    prompt: "hi",
    maxTurns: 2,
    cwd: stage0,
    signal: abortController.signal,
    onDelta: () => abortController.abort(),
}));
const abortDone = aborted.at(-1);
ok("#33 abort keeps the generated text in history", abortDone.stopReason === "aborted" && abortDone.history.length === 2 &&
    abortDone.history[1].content.includes("partial text") && abortDone.history[1].content.includes("[用户中断]"), JSON.stringify(abortDone.history));

const readScript = Array.from({ length: 3 }, () => ({ text: '<fastcode_tool>{"tool":"read_file","path":"a.txt"}</fastcode_tool>' }));
readScript.push({ text: "ok" });
const readLoop = await collect(runner.runAgent({ provider: scriptedProvider(readScript), model: "mock", prompt: "read", maxTurns: 6, cwd: stage0 }));
ok("#34 read-only repeats do not trip loop detection", readLoop.every((event) => event.type !== "loop_detected"), readLoop.map((event) => event.type).join(","));
const shellScript = Array.from({ length: 3 }, () => ({ text: '<fastcode_tool>{"tool":"shell","command":"echo x > loop.txt"}</fastcode_tool>' }));
shellScript.push({ text: "ok" });
const shellLoop = await collect(runner.runAgent({ provider: scriptedProvider(shellScript), model: "mock", prompt: "touch", maxTurns: 6, cwd: stage0 }));
ok("#34 side-effecting repeats trip loop detection once", shellLoop.filter((event) => event.type === "loop_detected").length === 1 &&
    shellLoop.at(-1).stopReason === "complete", shellLoop.map((event) => event.type).join(","));

const budgetRun = await collect(runner.runAgent({
    provider: scriptedProvider([
        { text: 'partial answer<fastcode_tool>{"tool":"pwd"}</fastcode_tool>' },
        { text: "unreachable" },
    ]),
    model: "mock",
    prompt: "hi",
    maxTurns: 5,
    cwd: stage0,
    tokenBudget: 5,
}));
const budgetError = budgetRun.find((event) => event.type === "error" && event.kind === "token_budget");
ok("#35 token budget yields an error and keeps generated text", Boolean(budgetError) && budgetRun.at(-1).stopReason === "token_budget" &&
    budgetRun.at(-1).finalText === "partial answer", JSON.stringify(budgetRun.at(-1).finalText));

const registry = await load("agent/registry.js");
let contractThrew = false;
try {
    registry.assertToolContract([{
        name: "bad",
        requiresTrust: true,
        stateScope: "turn",
        revalidate: ["sandboxRoots"],
        prepare: () => ({ ok: true }),
        execute: async () => ({ ok: true, output: "" }),
    }]);
}
catch {
    contractThrew = true;
}
ok("#36 registry rejects requiresTrust without revalidate trust", contractThrew);
ok("every tool declares a stateScope", registry.registry.list().every((tool) => ["call", "turn", "session"].includes(tool.stateScope)));
ok("every trust tool revalidates trust", registry.registry.list().filter((tool) => tool.requiresTrust).every((tool) => (tool.revalidate ?? []).includes("trust")));
ok("approve denies a dangerous shell command", registry.registry.approve({ tool: "shell", command: "rm -rf /" }, { cwd: stage0 }).kind === "deny");
const badMove = await agentTools.runAgentTool({ tool: "move_path", from: "a.txt" }, stage0);
ok("prepare rejection prevents side effects", badMove.ok === false && existsSync(join(stage0, "a.txt")), badMove.output);
const untrustedWrite = await agentTools.runAgentTool({ tool: "write_file", path: "c.txt", content: "x" }, stage0);
ok("untrusted side-effect tools are denied", untrustedWrite.ok === false && untrustedWrite.output.includes("not trusted") && !existsSync(join(stage0, "c.txt")), untrustedWrite.output);

process.env.FASTCODE_TRUST_ALL = "1";
const allowedShell = await agentTools.runAgentTool({ tool: "shell", command: "echo ok" }, stage0);
ok("trusted shell executes", allowedShell.ok === true && allowedShell.output.includes("ok"), allowedShell.output);
const trustedWrite = await agentTools.runAgentTool({ tool: "write_file", path: "b.txt", content: "x" }, stage0);
ok("trusted writes report sideEffects", trustedWrite.ok === true && (trustedWrite.sideEffects?.touched ?? []).length === 1, JSON.stringify(trustedWrite));
delete process.env.FASTCODE_TRUST_ALL;
const revokedShell = await agentTools.runAgentTool({ tool: "shell", command: "echo revoked" }, stage0);
ok("trust is re-read on every tool call", revokedShell.ok === false && revokedShell.output.includes("not trusted"), revokedShell.output);
process.env.FASTCODE_TRUST_ALL = "1";
const abortShell = new AbortController();
const shellStarted = Date.now();
const pendingShell = agentTools.runAgentTool({ tool: "shell", command: 'node -e "setTimeout(()=>{},1500)"' }, stage0, { signal: abortShell.signal });
setTimeout(() => abortShell.abort(), 100);
const abortedShell = await pendingShell;
const shellElapsed = Date.now() - shellStarted;
ok("#63 abort terminates a running shell and keeps output", abortedShell.ok === false && /aborted/i.test(abortedShell.output) && shellElapsed < 3000, `${shellElapsed}ms ${abortedShell.output}`);
delete process.env.FASTCODE_TRUST_ALL;

const trustPath = paths.getPaths().trust;
writeFileSync(trustPath, JSON.stringify({ trusted: [{ path: trust.normalizeProjectPath(stage0), addedAt: "2026-01-01T00:00:00Z" }] }));
ok("legacy trust.json migrates to the v1 paths schema", trust.isTrusted(stage0) === true && JSON.parse(readFileSync(trustPath, "utf8")).version === 1);
trust.untrustProject(stage0);

process.env.FASTCODE_TRUST_ALL = "1";
const checkpointEvents = await collect(runner.runAgent({
    provider: scriptedProvider([
        { text: '<fastcode_tool>{"tool":"write_file","path":"ck.txt","content":"hello"}</fastcode_tool>' },
        { text: "done" },
    ]),
    model: "mock",
    prompt: "write a checkpoint",
    maxTurns: 4,
    cwd: stage0,
}));
delete process.env.FASTCODE_TRUST_ALL;
const checkpoints = checkpointEvents.filter((event) => event.type === "checkpoint");
ok("runner emits checkpoints with active files", checkpoints.length >= 1 &&
    checkpoints.at(-1).activeFiles.some((file) => file.path.endsWith("ck.txt") && /^[0-9a-f]{8}$/.test(file.sha1_8)), JSON.stringify(checkpoints));

const crashLog = slog.createSessionLog({ providerId: "deepseek", model: "deepseek-v4-pro", cwd: stage0 });
crashLog.append({ type: "message", role: "user", content: "do work" });
crashLog.append({
    type: "checkpoint",
    turn: 3,
    cwd: stage0,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    activeFiles: [{ path: join(stage0, "a.txt"), sha1_8: "deadbeef", mtime: "2026-01-01T00:00:00.000Z" }],
    lastFactSeq: 2,
});
const unclosed = slog.latestUnclosedSession();
ok("#39 an unclosed session is detected with cwd/turns/files", unclosed?.id === crashLog.id && unclosed.cwd === stage0 &&
    unclosed.turns === 3 && unclosed.activeFiles.length === 1, JSON.stringify(unclosed));
ok("#39 a crashed session's messages can be loaded", slog.loadSessionMessages(crashLog.file).some((message) => message.content === "do work"));
crashLog.close();

process.env.FASTCODE_FSYNC = "1";
{
    const forced = slog.fsyncEnabled("checkpoint") === true && slog.fsyncEnabled("message") === false;
    const syncLog = slog.createSessionLog({ cwd: stage0 });
    const seq = syncLog.append({ type: "checkpoint", turn: 1, cwd: stage0, activeFiles: [] });
    syncLog.close();
    ok("checkpoint fsync can be forced and returns a fact sequence", forced && seq > 0, "seq=" + seq);
}
delete process.env.FASTCODE_FSYNC;

const beforePrune = slog.listSessions();
const victim = beforePrune[beforePrune.length - 1];
const victimProjection = slog.projectionPath(victim.file);
slog.pruneSessions(1);
ok("#40 prune keeps a projection instead of deleting memory", !existsSync(victim.file) && existsSync(victimProjection), JSON.stringify(beforePrune));

const projectionModule = await load("session/projection.js");
const factLog = slog.createSessionLog({ providerId: "deepseek", model: "deepseek-v4-pro", cwd: stage0 });
factLog.append({ type: "user", content: "fix a.txt" });
factLog.append({ type: "assistant_raw", content: 'Working<fastcode_tool>{"tool":"write_file","path":"a.txt","content":"hi"}</fastcode_tool>' });
factLog.append({ type: "tool_call", id: "tc_1", tool: "write_file", args: { tool: "write_file", path: "a.txt", content: "hi" } });
factLog.append({ type: "tool_result", id: "tc_1", tool: "write_file", ok: true, output: "wrote a.txt", sideEffects: { touched: [join(stage0, "a.txt")] } });
factLog.append({
    type: "checkpoint",
    turn: 1,
    cwd: stage0,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    activeFiles: [{ path: join(stage0, "a.txt"), sha1_8: "deadbeef", mtime: "2026-01-01T00:00:00.000Z" }],
});
factLog.append({ type: "assistant_raw", content: "Done." });
factLog.close();

const firstResume = projectionModule.resumeSession(factLog.file, stage0);
ok("resume rebuilds a projection from facts", firstResume.rebuilt && firstResume.messages.length === 4 &&
    firstResume.messages[0].role === "user" && firstResume.messages.at(-1).content === "Done.",
    JSON.stringify(firstResume.messages));
ok("resume restores cwd/provider/model", firstResume.meta.cwd === stage0 && firstResume.meta.providerId === "deepseek" && firstResume.meta.model === "deepseek-v4-pro", JSON.stringify(firstResume.meta));
ok("projection records active files and last fact sequence", firstResume.projection.activeFiles.length === 1 && firstResume.projection.lastFactSeq > 0);
ok("projection stays under 20KB", Buffer.byteLength(JSON.stringify(firstResume.projection), "utf8") < 20000);
const projectionFile = slog.projectionPath(factLog.file);
ok("projection is written next to the session", existsSync(projectionFile));

const tampered = JSON.parse(readFileSync(projectionFile, "utf8"));
tampered.fingerprint.modelId = "other::model";
writeFileSync(projectionFile, JSON.stringify(tampered), "utf8");
const rebuilt = projectionModule.resumeSession(factLog.file, stage0);
ok("projection fingerprint mismatch triggers a rebuild", rebuilt.rebuilt && rebuilt.warnings.some((warning) => warning.includes("fingerprint")), JSON.stringify(rebuilt.warnings));

const factLines = readFileSync(factLog.file, "utf8").split(LF).filter(Boolean);
writeFileSync(factLog.file, factLines.filter((line) => !line.includes('"type":"tool_result"')).join(LF) + LF, "utf8");
rmSync(projectionFile, { force: true });
const degraded = projectionModule.resumeSession(factLog.file, stage0);
const degradedText = degraded.messages.map((message) => message.content).join("\n");
ok("#43 resume survives a missing fact line", degradedText.includes("可安全重试") && degraded.messages.length >= 3, degradedText.slice(0, 200));
const unpairedShell = projectionModule.factsToMessages([
    { type: "user", content: "run" },
    { type: "assistant_raw", content: "running" },
    { type: "tool_call", id: "s1", tool: "shell", args: { tool: "shell", command: "rm build" } },
]);
ok("unpaired non-idempotent calls are marked execution-unknown", unpairedShell.map((message) => message.content).join("\n").includes("执行状态未知"));
const hugeProjection = projectionModule.buildProjection([
    { seq: 1, type: "user", content: "hi" },
    { seq: 2, type: "assistant_raw", content: "reading" },
    { seq: 3, type: "tool_call", id: "r1", tool: "read_file", args: { tool: "read_file", path: "a.txt" } },
    { seq: 4, type: "tool_result", id: "r1", tool: "read_file", ok: true, output: "y".repeat(30000) },
    { seq: 5, type: "assistant_raw", content: "done" },
], { cwd: stage0, providerId: "deepseek", model: "deepseek-v4-pro" });
ok("large tool output is clamped in the projection", Buffer.byteLength(JSON.stringify(hugeProjection), "utf8") < 20000);

const showOutput = execFileSync(process.execPath, [join(pkgDir, "bin", "fastcode.mjs"), "sessions", "show", factLog.id], {
    env: { ...process.env, FASTCODE_HOME: process.env.FASTCODE_HOME },
    encoding: "utf8",
});
ok("sessions show distinguishes facts and projection", showOutput.includes("[assistant_raw]") && showOutput.includes("[projection]"), showOutput.slice(0, 200));

const compactionModule = await load("agent/compaction.js");
const longHistory = [{ role: "user", content: "Please fix src/early-file.ts and keep notes in src/early-notes.md" }];
for (let i = 0; i < 40; i += 1) {
    longHistory.push({ role: "assistant", content: `Step ${i}: edited src/file-${i}.ts and wrote the result.` });
    longHistory.push({
        role: "user",
        content: `FastCode executed the requested local tools.\n\nTool result ${i} (ok)\ncall: {"tool":"write_file","path":"src/file-${i}.ts"}\noutput:\n\`\`\`\n${"wrote source lines ".repeat(30)}src/file-${i}.ts\n\`\`\``,
    });
}
const beforeCompactTokens = modelMeta.estMessagesTokens(longHistory, { providerId: "deepseek", model: "deepseek-v4-pro" });
const compactedResult = compactionModule.compactMessages(longHistory, { ...compactionModule.DEFAULT_COMPACTION_CONFIG, localThresholdRatio: 0.0001 }, {
    contextWindow: 32768,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
});
ok("#44 local compaction drops at least 60% of estimated tokens", compactedResult.compacted && compactedResult.afterTokens < beforeCompactTokens * 0.4,
    `${beforeCompactTokens} -> ${compactedResult.afterTokens}`);
const compactedText = compactedResult.messages.map((message) => message.content).join("\n");
ok("#44 summary keeps early file names", compactedResult.summary.includes("src/file-0.ts") && compactedText.includes("src/early-notes.md"), compactedResult.summary.slice(0, 200));
ok("#44 summary is under 1500 tokens and written to disk", modelMeta.estTokens(compactedResult.summary, { providerId: "deepseek", model: "deepseek-v4-pro" }) < 1500 &&
    Boolean(compactedResult.summaryFile) && existsSync(compactedResult.summaryFile));
const heapHistory = Array.from({ length: 20 }, (_value, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content: `turn ${index}` }));
const heapCompacted = compactionModule.compactMessages(heapHistory, { ...compactionModule.DEFAULT_COMPACTION_CONFIG, heapLimitMb: 0.000001 }, {
    contextWindow: 1000000,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
});
ok("#56 heap pressure forces compaction below the token threshold", heapCompacted.compacted && heapCompacted.reason === "heap", JSON.stringify({ reason: heapCompacted.reason, compacted: heapCompacted.compacted }));
const serverCompacted = compactionModule.compactMessages(heapHistory, { ...compactionModule.DEFAULT_COMPACTION_CONFIG, serverCompactionAware: true }, {
    contextWindow: 1,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    serverOpaqueState: "opaque-state",
});
ok("server-aware compaction skips the local summary", serverCompacted.compacted && serverCompacted.source === "server" &&
    !serverCompacted.summary && !serverCompacted.summaryFile, JSON.stringify(serverCompacted));
const clamped = compactionModule.localThresholdTokens({ ...compactionModule.DEFAULT_COMPACTION_CONFIG, serverCompactionAware: true, serverCompactThreshold: 100000 }, 200000);
ok("local threshold sits 8K above the server threshold", clamped >= 108192, String(clamped));

const summaryFacts = [
    { seq: 1, type: "session_start", cwd: stage0, providerId: "deepseek", model: "deepseek-v4-pro" },
    { seq: 2, type: "user", content: "fix src/early-file.ts" },
    { seq: 3, type: "compacted", summaryRef: compactedResult.summaryFile, keepMessages: compactedResult.keptMessages, source: "local", beforeTokens: compactedResult.beforeTokens, afterTokens: compactedResult.afterTokens },
    { seq: 4, type: "user", content: "continue" },
    { seq: 5, type: "assistant_raw", content: "done" },
];
const summaryProjection = projectionModule.buildProjection(summaryFacts);
ok("projection records compactionSource and embeds the summary", summaryProjection.fingerprint.compactionSource === "local" &&
    summaryProjection.messages.some((message) => message.content.includes("[context summary]")), JSON.stringify(summaryProjection.fingerprint));
const compactedRun = await collect(runner.runAgent({
    provider: scriptedProvider([{ text: "compacted done" }]),
    model: "mock",
    messages: longHistory,
    prompt: "continue",
    maxTurns: 1,
    cwd: stage0,
    compaction: { ...compactionModule.DEFAULT_COMPACTION_CONFIG, localThresholdRatio: 0.0001 },
}));
ok("runner emits a compaction event before the request", compactedRun.some((event) => event.type === "compaction" && event.source === "local" && event.afterTokens < event.beforeTokens), JSON.stringify(compactedRun.filter((event) => event.type === "compaction")));
const contextCommand = await load("commands/context.js");
const contextOutput = contextCommand.contextCommand.run({
    state: { history: [{ role: "user", content: "hi" }], providerId: "deepseek", model: "deepseek-v4-pro" },
});
ok("/context reports tokens, threshold, and heap", /Context:/.test(contextOutput.message) && /Compaction threshold/.test(contextOutput.message) && /Heap:/.test(contextOutput.message));

process.env.FASTCODE_TRUST_ALL = "1";
writeFileSync(join(stage0, "up.txt"), "old" + LF, "utf8");
writeFileSync(join(stage0, "move.txt"), "move" + LF, "utf8");
writeFileSync(join(stage0, "del.txt"), "delete" + LF, "utf8");
const patch45 = `*** Begin Patch
*** Add File: add.txt
+added
*** Update File: up.txt
@@
-old
+new
*** Update File: move.txt
*** Move to: moved.txt
*** Delete File: del.txt
*** End Patch
`;
const patched45 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch45 }, stage0);
ok("#45 patch supports Add/Update/Delete/Move", patched45.ok === true &&
    readFileSync(join(stage0, "add.txt"), "utf8") === "added" + LF &&
    readFileSync(join(stage0, "up.txt"), "utf8") === "new" + LF &&
    !existsSync(join(stage0, "move.txt")) && readFileSync(join(stage0, "moved.txt"), "utf8") === "move" + LF &&
    !existsSync(join(stage0, "del.txt")), patched45.output);
ok("FC-057 patch returns a per-file diff", patched45.output.includes("--- a/up.txt") && patched45.output.includes("+++ b/up.txt") && patched45.output.includes("@@"));

writeFileSync(join(stage0, "multi.txt"), "a" + LF + "b" + LF + "c" + LF + "d" + LF + "e" + LF, "utf8");
const patch46 = `*** Begin Patch
*** Update File: multi.txt
@@
-a
+A
@@
-e
+E
*** End Patch
`;
const patched46 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch46 }, stage0);
ok("#46 patch applies multiple hunks", patched46.ok === true && readFileSync(join(stage0, "multi.txt"), "utf8") === "A" + LF + "b" + LF + "c" + LF + "d" + LF + "E" + LF, patched46.output);

writeFileSync(join(stage0, "bad.txt"), "alpha" + LF + "beta" + LF, "utf8");
const patch47 = `*** Begin Patch
*** Update File: bad.txt
@@
-gamma
+delta
*** End Patch
`;
const patched47 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch47 }, stage0);
ok("#47 context mismatch leaves the file unchanged", patched47.ok === false && readFileSync(join(stage0, "bad.txt"), "utf8") === "alpha" + LF + "beta" + LF, patched47.output);

writeFileSync(join(stage0, "first.txt"), "first" + LF, "utf8");
writeFileSync(join(stage0, "second.txt"), "second" + LF, "utf8");
const patch48 = `*** Begin Patch
*** Update File: first.txt
@@
-first
+FIRST
*** Update File: second.txt
@@
-missing
+SECOND
*** End Patch
`;
const patched48 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch48 }, stage0);
ok("#48 a later file failure leaves the earlier file untouched", patched48.ok === false &&
    readFileSync(join(stage0, "first.txt"), "utf8") === "first" + LF &&
    readFileSync(join(stage0, "second.txt"), "utf8") === "second" + LF, patched48.output);

writeFileSync(join(stage0, "crlf.txt"), "one" + CRLF + "two" + CRLF + "three" + CRLF, "utf8");
const patch49 = `*** Begin Patch
*** Update File: crlf.txt
@@
-two
+TWO
*** End Patch
`;
const patched49 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch49 }, stage0);
const crlfResult = readFileSync(join(stage0, "crlf.txt"), "utf8");
ok("#49 patch preserves CRLF line endings", patched49.ok === true &&
    crlfResult === "one" + CRLF + "TWO" + CRLF + "three" + CRLF && !/[^\r]\n/.test(crlfResult), JSON.stringify(crlfResult));

let patchLinkMade = false;
try {
    writeFileSync(join(stage0, "link-target.txt"), "safe" + LF, "utf8");
    symlinkSync(join(stage0, "link-target.txt"), join(stage0, "link.txt"), "file");
    patchLinkMade = true;
}
catch {
    // Windows without symlink privilege: skip.
}
if (patchLinkMade) {
    const patch50 = `*** Begin Patch
*** Update File: link.txt
@@
-safe
+unsafe
*** End Patch
`;
    const patched50 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch50 }, stage0);
    ok("#50 patch refuses a symbolic link", patched50.ok === false && readFileSync(join(stage0, "link-target.txt"), "utf8") === "safe" + LF, patched50.output);
}
if (process.platform !== "win32") {
    const script = join(stage0, "script.sh");
    const secret = join(stage0, "secret.txt");
    writeFileSync(script, "#!/bin/sh" + LF + "echo hi" + LF, "utf8");
    writeFileSync(secret, "token" + LF, "utf8");
    chmodSync(script, 0o755);
    chmodSync(secret, 0o600);
    const patch51 = `*** Begin Patch
*** Update File: script.sh
@@
-echo hi
+echo hello
*** Update File: secret.txt
@@
-token
+rotated
*** End Patch
`;
    const patched51 = await agentTools.runAgentTool({ tool: "apply_patch", patch: patch51 }, stage0);
    ok("#51 patch preserves 0755 / 0600 mode bits", patched51.ok === true &&
        (statSync(script).mode & 0o777) === 0o755 && (statSync(secret).mode & 0o777) === 0o600,
        (statSync(script).mode & 0o777).toString(8) + "/" + (statSync(secret).mode & 0o777).toString(8));
}
writeFileSync(join(stage0, "move-from.txt"), "from" + LF, "utf8");
writeFileSync(join(stage0, "move-target.txt"), "target" + LF, "utf8");
const move52 = await agentTools.runAgentTool({ tool: "move_path", from: "move-from.txt", to: "move-target.txt" }, stage0);
ok("#52 move refuses an existing target", move52.ok === false &&
    readFileSync(join(stage0, "move-from.txt"), "utf8") === "from" + LF &&
    readFileSync(join(stage0, "move-target.txt"), "utf8") === "target" + LF, move52.output);
writeFileSync(join(stage0, "amb.txt"), "same" + LF + "same" + LF, "utf8");
const patchAmb = `*** Begin Patch
*** Update File: amb.txt
@@
-same
+other
*** End Patch
`;
const ambiguous = await agentTools.runAgentTool({ tool: "apply_patch", patch: patchAmb }, stage0);
ok("ambiguous patch context is reported, not silently applied", ambiguous.ok === false &&
    /ambiguous/i.test(ambiguous.output) && /lines 1, 2/.test(ambiguous.output) &&
    readFileSync(join(stage0, "amb.txt"), "utf8") === "same" + LF + "same" + LF, ambiguous.output);
delete process.env.FASTCODE_TRUST_ALL;

const shells = await load("agent/shell-session.js");
process.env.FASTCODE_TRUST_ALL = "1";
const backgroundStarted = Date.now();
const background = await agentTools.runAgentTool({
    tool: "shell",
    command: 'node -e "console.log(\'one\'); setTimeout(()=>console.log(\'two\'), 3200)"',
}, stage0);
const backgroundElapsed = Date.now() - backgroundStarted;
const backgroundId = /\[session (sh_[^\]]+)\]/.exec(background.output)?.[1];
ok("#53 a long shell command returns a session id quickly", background.ok === true && Boolean(backgroundId) && backgroundElapsed < 3000,
    `${backgroundElapsed}ms ${background.output}`);
const jobsModule = await load("commands/jobs.js");
const jobsOutput = jobsModule.jobsCommand.run({});
ok("/jobs lists the background session", Boolean(backgroundId) && jobsOutput.message.includes(backgroundId), jobsOutput.message);
const firstPoll = await agentTools.runAgentTool({ tool: "shell", session_id: backgroundId, waitMs: 2500 }, stage0);
ok("#62 polling returns only new output", firstPoll.ok !== undefined && firstPoll.output.includes("two") && !firstPoll.output.includes("one"), firstPoll.output);

const killTarget = await agentTools.runAgentTool({
    tool: "shell",
    command: 'node -e "setTimeout(()=>{}, 8000)"',
}, stage0);
const killTargetId = /\[session (sh_[^\]]+)\]/.exec(killTarget.output)?.[1];
const killModule = await load("commands/kill.js");
const killOutput = killTargetId ? killModule.killCommand.run({ args: [killTargetId] }) : { message: "" };
const killedPoll = killTargetId ? await agentTools.runAgentTool({ tool: "shell", session_id: killTargetId }, stage0) : { ok: true, output: "" };
ok("/kill stops a background process tree", Boolean(killTargetId) && /Killed/.test(killOutput.message) &&
    /killed|aborted/i.test(killedPoll.output), killOutput.message + " / " + killedPoll.output);

if (process.platform !== "win32") {
    const beforeSpawns = shells.shellPoolStats().spawns;
    for (let i = 0; i < 3; i += 1)
        await agentTools.runAgentTool({ tool: "shell", command: "echo pooled" }, stage0);
    const afterSpawns = shells.shellPoolStats().spawns;
    ok("#54 resident shell pool keeps spawns to at most 2", afterSpawns - beforeSpawns <= 2,
        `${beforeSpawns} -> ${afterSpawns}`);
}
delete process.env.FASTCODE_TRUST_ALL;
shells.shutdownShells();
await new Promise((resolve) => setTimeout(resolve, 300));

const nativeTools = await load("lib/native-tools.js");
const accumulator = new Map();
nativeTools.mergeToolCallDelta(accumulator, { index: 1, id: "call_b", function: { name: "grep", arguments: '{"pat' } });
nativeTools.mergeToolCallDelta(accumulator, { index: 0, id: "call_a", function: { name: "pwd", arguments: "{}" } });
nativeTools.mergeToolCallDelta(accumulator, { index: 1, function: { arguments: 'tern":"x"}' } });
const mergedCalls = nativeTools.finalizeToolCalls(accumulator);
ok("#70 native tool calls merge by index, not array order", mergedCalls.length === 2 &&
    mergedCalls[0].id === "call_a" && mergedCalls[1].id === "call_b" &&
    mergedCalls[1].arguments === '{"pattern":"x"}', JSON.stringify(mergedCalls));

const protocolMode = await load("agent/protocol-mode.js");
const autoEnv = { FASTCODE_TOOL_PROTOCOL: "auto" };
ok("auto protocol picks native for compatible providers", protocolMode.resolveToolProtocol({}, "deepseek", "deepseek-v4-pro", autoEnv) === "native");
ok("unknown providers fail closed to pseudo", protocolMode.resolveToolProtocol({}, "custom", "my-model", autoEnv) === "legacy");
const cachedPseudo = protocolMode.withToolCapability({}, "deepseek", "deepseek-v4-pro", "pseudo");
ok("cached pseudo capability overrides auto", protocolMode.resolveToolProtocol(cachedPseudo, "deepseek", "deepseek-v4-pro", autoEnv) === "legacy");

const schemasModule = await load("agent/tool-schemas.js");
const schemas = schemasModule.toolSchemas();
ok("tool schemas cover the registry", schemas.length === registry.registry.list().length &&
    schemas.some((schema) => schema.function.name === "apply_patch" && schema.function.parameters.required.includes("patch")));

const nativeRun = await collect(runner.runAgent({
    provider: scriptedProvider([
        { toolCalls: [{ id: "call_1", name: "pwd", arguments: "{}" }] },
        { text: "done" },
    ]),
    model: "mock",
    prompt: "native",
    maxTurns: 3,
    cwd: stage0,
    protocol: "native",
    tools: schemas,
}));
const nativeDone = nativeRun.at(-1);
ok("native tools execute and produce tool-role history", nativeDone.stopReason === "complete" &&
    nativeRun.some((event) => event.type === "tool_call" && event.native === true) &&
    nativeDone.history.some((message) => message.role === "tool" && message.toolCallId === "call_1"),
    JSON.stringify(nativeDone.history));

let fallbackCount = 0;
let fallbackCalls = 0;
const nativeUnsupportedProvider = {
    id: "mock",
    label: "Mock",
    authEnv: [],
    baseUrl: "",
    defaultModel: "mock",
    listModels: async () => [],
    async *stream(req) {
        if (req.tools && req.tools.length > 0)
            throw new Error("400 Bad Request: tools are not supported by this model");
        fallbackCalls += 1;
        if (fallbackCalls === 1)
            yield { delta: '<fastcode_tool>{"tool":"pwd"}</fastcode_tool>', done: false };
        else
            yield { delta: "done", done: false };
        yield { delta: "", done: true };
    },
};
const fallbackRun = await collect(runner.runAgent({
    provider: nativeUnsupportedProvider,
    model: "mock",
    prompt: "fallback",
    maxTurns: 3,
    cwd: stage0,
    protocol: "native",
    tools: schemas,
    onProtocolFallback: () => { fallbackCount += 1; },
}));
ok("#57 a 400 on native tools downgrades to pseudo without throwing", fallbackCount === 1 &&
    fallbackRun.some((event) => event.type === "tool_call" && !event.native) &&
    fallbackRun.at(-1).stopReason === "complete", fallbackRun.map((event) => event.type).join(","));

const nativeFacts = [
    { seq: 1, type: "session_start", cwd: stage0, providerId: "deepseek", model: "deepseek-v4-pro" },
    { seq: 2, type: "user", content: "native" },
    { seq: 3, type: "assistant_raw", content: "", toolCalls: [{ id: "call_1", name: "pwd", arguments: "{}" }] },
    { seq: 4, type: "tool_call", id: "call_1", tool: "pwd", args: { tool: "pwd" }, native: true },
    { seq: 5, type: "tool_result", id: "call_1", tool: "pwd", ok: true, output: stage0 },
    { seq: 6, type: "assistant_raw", content: "done" },
];
const nativeProjection = projectionModule.buildProjection(nativeFacts);
ok("native facts rebuild tool-role projection messages", nativeProjection.messages.some((message) => message.role === "assistant" && message.toolCalls?.length === 1) &&
    nativeProjection.messages.some((message) => message.role === "tool" && message.toolCallId === "call_1"), JSON.stringify(nativeProjection.messages));

const compactCommand = await load("commands/compact.js");
let compactedHistory = [];
const compactOutput = compactCommand.compactCommand.run({
    state: { history: longHistory, providerId: "deepseek", model: "deepseek-v4-pro" },
    actions: { replaceHistory: (messages) => { compactedHistory = messages; } },
});
ok("/compact forces compaction and replaces history", compactedHistory.length > 0 && compactedHistory.length < longHistory.length &&
    /context compacted/.test(compactOutput.message), compactOutput.message);
let expandedValue = false;
const expandCommand = await load("commands/expand.js");
expandCommand.expandCommand.run({ state: { expanded: false }, actions: { setExpanded: (value) => { expandedValue = value; } } });
ok("/expand toggles full tool output", expandedValue === true);
let steered = "";
const steerCommand = await load("commands/steer.js");
const steerOutput = steerCommand.steerCommand.run({ args: ["focus", "on", "tests"], state: { busy: true }, actions: { steer: (text) => { steered = text; } } });
ok("/steer queues guidance during a run", steered === "focus on tests" && /queued/i.test(steerOutput.message));
let cancelled = false;
const cancelCommand = await load("commands/cancel.js");
const cancelOutput = cancelCommand.cancelCommand.run({ state: { busy: true }, actions: { cancelRun: () => { cancelled = true; } } });
ok("/cancel aborts the active run", cancelled && /Cancelling/.test(cancelOutput.message));
const attachCommand = await load("commands/attach.js");
const attachOutput = await attachCommand.attachCommand.run({ args: ["sh_missing"] });
ok("/attach reports an unknown session", /Unknown session/.test(attachOutput.message));
const diagnostics = await load("lib/diagnostics.js");
const doctor = diagnostics.collectDiagnostics();
ok("doctor reports tmpdir, auth mode, and memory", typeof doctor.tmpdir === "string" && doctor.tmpdir.length > 0 &&
    typeof doctor.authMode === "string" && doctor.memTotalMb > 0 && doctor.sseIdleMs >= 25000, JSON.stringify({ tmpdir: doctor.tmpdir, authMode: doctor.authMode, mem: doctor.memTotalMb, sse: doctor.sseIdleMs }));

rmSync(stage0, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
rmSync(process.env.FASTCODE_HOME, { recursive: true, force: true });

console.log("");
console.log(fail === 0 ? "ALL PASS (" + pass + " checks)" : pass + " passed, " + fail + " FAILED");
process.exit(fail === 0 ? 0 : 1);
