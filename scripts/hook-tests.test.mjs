// H1a-1: runTask hook-host behaviour (real child process).
// These tests run after smoke-test.mjs via `npm test`.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const home = await mkdtemp(join(tmpdir(), "fastcode-hooks-"));
process.env.FASTCODE_HOME = home;
process.env.FASTCODE_TRUST_ALL = "1";
process.env.DEEPSEEK_API_KEY = "spike-secret";
process.env.ANTHROPIC_AUTH_TOKEN = "spike-secret";

const server = createServer((req, res) => {
    req.on("data", () => { });
    req.on("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
    });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.FASTCODE_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
process.env.FASTCODE_MODEL = "mock";

const hooksDir = join(home, "hooks");
const marker = join(home, "hook-marker.log");
const loadFile = join(home, "hook-loads.log");
const { runTask } = await import("../package/dist/lib.js");
const { dispatchHook, startHookHost, stopHookHost } = await import("../package/dist/hooks/dispatch.js");

async function resetHooks() {
    await rm(hooksDir, { recursive: true, force: true });
    await mkdir(hooksDir, { recursive: true });
    await rm(marker, { force: true });
    await rm(loadFile, { force: true });
}

async function writeHook(file, code) {
    await writeFile(join(hooksDir, file), code, "utf8");
}

async function run(enableHooks) {
    const handle = await runTask(
        { prompt: "hi", provider: "custom", model: "mock", cwd: home },
        { enableHooks },
    );
    return await handle.wait();
}

after(async () => {
    server.close();
    await rm(home, { recursive: true, force: true });
});

test("H1 hook block is ignored", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `export default async function () { return { block: true }; }\n`);
    const result = await run(true);
    assert.equal(result.status, "completed");
});

test("H1 hook throw is isolated", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `export default async function () { throw new Error("boom"); }\n`);
    const result = await run(true);
    assert.equal(result.status, "completed");
});

// Expected behavior: soft timeout marks the hook abandoned; stopHookHost()
// exits early, so a late hook continuation (e.g. console.error after sleep)
// is suppressed by design. This is not a failure.
test("H1 hook timeout soft", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `export default async function () { await new Promise(() => {}); }\n`);
    const started = Date.now();
    const result = await run(true);
    const elapsed = Date.now() - started;
    assert.equal(result.status, "completed");
    assert.ok(elapsed >= 1000, "soft timeout should delay completion");
    assert.ok(elapsed < 1900, "soft timeout should finish before the 2000ms hook sleep");
});

test("H1 hook timeout hard", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `export default function () { while (true) {} }\n`);
    const result = await run(true);
    assert.equal(result.status, "completed");
});

test("H1 hook cannot read apiKey", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `
import { appendFileSync } from "node:fs";
export default async function (ctx) {
    appendFileSync(${JSON.stringify(marker)}, JSON.stringify({
        hasEnvSecret: "DEEPSEEK_API_KEY" in process.env || "ANTHROPIC_AUTH_TOKEN" in process.env,
        hasCtxApiKey: "apiKey" in ctx,
    }) + "\\n");
}
`);
    const result = await run(true);
    assert.equal(result.status, "completed");
    const line = (await readFile(marker, "utf8")).trim();
    const seen = JSON.parse(line);
    assert.equal(seen.hasEnvSecret, false);
    assert.equal(seen.hasCtxApiKey, false);
});

test("H1 hook load error", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", "export default function ( {\n");
    const result = await run(true);
    assert.equal(result.status, "completed");
});

test("H1 tool events are delivered", async () => {
    await resetHooks();
    const hook = (name) => `
import { appendFileSync } from "node:fs";
export default async function (ctx) { appendFileSync(${JSON.stringify(marker)}, ctx.name + "\\n"); }
`;
    await writeHook("on-tool-call.mjs", hook());
    await writeHook("on-tool-result.mjs", hook());
    await writeHook("on-run-complete.mjs", hook());
    let calls = 0;
    const toolServer = createServer((req, res) => {
        req.on("data", () => { });
        req.on("end", () => {
            calls += 1;
            res.writeHead(200, { "content-type": "text/event-stream" });
            const content = calls === 1
                ? '<fastcode_tool>{"tool":"pwd"}</fastcode_tool>'
                : "done";
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
        });
    });
    await new Promise((resolve) => toolServer.listen(0, "127.0.0.1", resolve));
    const previous = process.env.FASTCODE_BASE_URL;
    process.env.FASTCODE_BASE_URL = `http://127.0.0.1:${toolServer.address().port}/v1`;
    try {
        const result = await run(true);
        assert.equal(result.status, "completed");
    }
    finally {
        if (previous === undefined) delete process.env.FASTCODE_BASE_URL;
        else process.env.FASTCODE_BASE_URL = previous;
        toolServer.close();
    }
    const lines = (await readFile(marker, "utf8")).trim().split("\n").filter(Boolean);
    assert.ok(lines.includes("on-tool-call"), JSON.stringify(lines));
    assert.ok(lines.includes("on-tool-result"), JSON.stringify(lines));
    assert.ok(lines.includes("on-run-complete"), JSON.stringify(lines));
});

test("H1 IPC result readback", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `export default async function () {}\n`);
    const runner = fileURLToPath(new URL("../package/dist/hooks/hook-host-runner.js", import.meta.url));
    const child = spawn(process.execPath, [runner, hooksDir, "1500"], {
        env: {
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? process.env.USERPROFILE ?? "",
            TMPDIR: process.env.TMPDIR ?? process.env.TEMP ?? "",
        },
        stdio: ["pipe", "pipe", "pipe"],
    });
    const frames = [];
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
        try {
            frames.push(JSON.parse(line));
        }
        catch {
            // ignore non-JSON
        }
    });
    child.stdin.write(JSON.stringify({
        type: "event",
        id: 7,
        event: { name: "on-run-complete", event: { type: "done", history: [], finalText: "x", stopReason: "complete" } },
        ctx: { taskId: "ipc" },
    }) + "\n");
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !frames.some((frame) => frame.type === "result"))
        await new Promise((resolve) => setTimeout(resolve, 20));
    const result = frames.find((frame) => frame.type === "result");
    assert.ok(result, JSON.stringify(frames));
    assert.equal(result.id, 7);
    assert.equal(result.ok, true);
    try { child.stdin.end(); } catch { }
    try { child.kill(); } catch { }
    rl.close();
});

test("H1 hooks default off", async () => {
    await resetHooks();
    await writeHook("on-run-complete.mjs", `
import { appendFileSync } from "node:fs";
export default async function () { appendFileSync(${JSON.stringify(marker)}, "hit\\n"); }
`);
    const result = await run(false);
    assert.equal(result.status, "completed");
    await assert.rejects(readFile(marker, "utf8"));
});

const cli = fileURLToPath(new URL("../package/dist/cli.js", import.meta.url));

async function runHeadless(env) {
    const child = spawn(process.execPath, [cli, "--ui", "json", "hi"], {
        cwd: home,
        env: {
            ...process.env,
            FASTCODE_HOME: home,
            FASTCODE_TRUST_ALL: "1",
            FASTCODE_LANG: "en",
            ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    const code = await new Promise((resolve) => child.on("exit", resolve));
    return { code, out, err };
}

async function writeConfig() {
    await writeFile(join(home, "config.json"), JSON.stringify({
        providerId: "custom",
        model: "mock",
        agentMode: true,
    }), "utf8");
}

test("H1b headless CLI hooks opt-in", async () => {
    await resetHooks();
    await writeConfig();
    await writeHook("on-run-complete.mjs", `
import { appendFileSync } from "node:fs";
export default async function (ctx) {
    console.log("hook-noise");
    appendFileSync(${JSON.stringify(marker)}, ctx.name + "\\n");
}
`);
    const started = Date.now();
    const result = await runHeadless({ FASTCODE_HOOKS: "1" });
    assert.equal(result.code, 0, result.err);
    assert.ok(Date.now() - started < 2000, "headless hook run must not linger on stop timers");
    const lines = result.out.split(/\r?\n/).filter(Boolean);
    assert.ok(lines.length > 0, result.out);
    for (const line of lines)
        assert.doesNotThrow(() => JSON.parse(line), line);
    assert.ok(!result.out.includes("hook-noise"), result.out);
    let seen = "";
    try {
        seen = (await readFile(marker, "utf8")).trim();
    }
    catch {
        assert.fail(`marker missing; stdout=${result.out} stderr=${result.err}`);
    }
    assert.equal(seen, "on-run-complete");
});

test("H1b headless CLI default off", async () => {
    await resetHooks();
    await writeConfig();
    await writeHook("on-run-complete.mjs", `
import { appendFileSync } from "node:fs";
export default async function () { appendFileSync(${JSON.stringify(marker)}, "hit\\n"); }
`);
    const env = { ...process.env, FASTCODE_HOME: home, FASTCODE_TRUST_ALL: "1", FASTCODE_LANG: "en" };
    delete env.FASTCODE_HOOKS;
    const child = spawn(process.execPath, [cli, "--ui", "json", "hi"], {
        cwd: home,
        env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 0);
    for (const line of out.split(/\r?\n/).filter(Boolean))
        assert.doesNotThrow(() => JSON.parse(line), line);
    await assert.rejects(readFile(marker, "utf8"));
});

async function writeLoadHook(extra = "") {
    await writeHook("on-run-complete.mjs", `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const f = ${JSON.stringify(loadFile)};
let n = existsSync(f) ? Number(readFileSync(f, "utf8")) || 0 : 0;
n += 1;
writeFileSync(f, String(n));
export default async function (ctx) { appendFileSync(${JSON.stringify(marker)}, "load=" + n + " " + ctx.name + "\\n"); }
${extra}
`);
}

const hostOptions = { enabled: true, taskId: "mtime", cwd: home, providerId: "custom", model: "mock" };
const hostEvent = { name: "on-run-complete", event: { type: "done", history: [], finalText: "x", stopReason: "complete" } };

async function readLines(file) {
    return (await readFile(file, "utf8")).trim().split("\n").filter(Boolean);
}

test("H1a-2 TUI host is reused when hook mtime is unchanged", async () => {
    await resetHooks();
    await writeLoadHook();
    try {
        await startHookHost(hostOptions);
        await dispatchHook(hostEvent, { taskId: "mtime" });
        await stopHookHost({ shutdown: false });
        await startHookHost(hostOptions);
        await dispatchHook(hostEvent, { taskId: "mtime" });
        await stopHookHost({ shutdown: true });
    }
    finally {
        await stopHookHost({ shutdown: true });
    }
    assert.deepEqual(await readLines(marker), [
        "load=1 on-run-complete",
        "load=1 on-run-complete",
    ]);
    assert.equal((await readFile(loadFile, "utf8")).trim(), "1");
});

test("H1a-2 mtime change restarts the hook host", async () => {
    await resetHooks();
    await writeLoadHook();
    try {
        await startHookHost(hostOptions);
        await dispatchHook(hostEvent, { taskId: "mtime" });
        await stopHookHost({ shutdown: false });
        await new Promise((resolve) => setTimeout(resolve, 25));
        await writeLoadHook("// mtime-change");
        await startHookHost(hostOptions);
        await dispatchHook(hostEvent, { taskId: "mtime" });
        await stopHookHost({ shutdown: true });
    }
    finally {
        await stopHookHost({ shutdown: true });
    }
    assert.deepEqual(await readLines(marker), [
        "load=1 on-run-complete",
        "load=2 on-run-complete",
    ]);
    assert.equal((await readFile(loadFile, "utf8")).trim(), "2");
});
