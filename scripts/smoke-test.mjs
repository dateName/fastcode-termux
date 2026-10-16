#!/usr/bin/env node
/**
 * FastCode smoke test — structural and behavioural checks on the compiled package.
 * Usage (from the project root):  node scripts/smoke-test.mjs
 */
import { readdirSync, mkdtempSync, rmSync, symlinkSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
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

process.env.FASTCODE_HOME = mkdtempSync(join(tmpdir(), "fastcode-home-"));
const store = await load("config/store.js");
const paths = await load("config/paths.js");
const cfg = store.loadConfig();
store.saveConfig({ ...cfg, providerId: "deepseek", model: "deepseek-chat" });
ok("saveConfig writes config.json", existsSync(paths.getPaths().config));
ok("config and keys stay in separate files", !existsSync(paths.getPaths().auth));

// API keys are scoped to provider + model and never leak across models.
store.setCredential("deepseek", "deepseek-chat", "sk-1234567890abcd");
ok("a scoped key resolves for its own provider+model", store.resolveApiKey("deepseek", "deepseek-chat", []).status === "ok");
ok("a key does NOT resolve for another model", store.resolveApiKey("deepseek", "deepseek-reasoner", []).status === "missing");
process.env.DEEPSEEK_API_KEY = "sk-fromenv";
ok("env var is a provider-wide fallback", store.resolveApiKey("deepseek", "deepseek-reasoner", ["DEEPSEEK_API_KEY"]).status === "ok");
delete process.env.DEEPSEEK_API_KEY;
ok("maskKey hides the middle", store.maskKey("sk-1234567890abcd") === "sk-****abcd");
writeFileSync(paths.getPaths().auth, JSON.stringify({ keys: { openai: "sk-legacy-0000wxyz" } }));
ok("a legacy provider-only key is unbound, not used", store.resolveApiKey("openai", "gpt-4o", []).status === "unbound");
store.setCredential("openai", "gpt-4o", "sk-new-1234efgh");
ok("re-binding a scope clears the provider's legacy key", store.listLegacy().length === 0);

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

rmSync(process.env.FASTCODE_HOME, { recursive: true, force: true });

console.log("");
console.log(fail === 0 ? "ALL PASS (" + pass + " checks)" : pass + " passed, " + fail + " FAILED");
process.exit(fail === 0 ? 0 : 1);
