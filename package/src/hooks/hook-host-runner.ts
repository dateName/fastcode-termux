/**
 * H1 hook host child process.
 *
 * Loads <hooks>/on-*.mjs and speaks NDJSON over stdio:
 *   parent -> host: { type: "event", id, event, ctx }
 *   host -> parent: { type: "result", id, ok, error, durationMs }
 *                  { type: "load_error", file, error }
 *
 * stdout is the IPC channel. Hook console.log/stdout is redirected to stderr.
 * This file is spawned, never imported by the main process.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import readline from "node:readline";

const HOOK_FILES = ["on-tool-call.mjs", "on-tool-result.mjs", "on-run-complete.mjs"] as const;
const hooksDir = process.argv[2] ?? "";
const softTimeoutMs = Number(process.argv[3] ?? 1500);

type HookFn = (ctx: Record<string, unknown>) => unknown;
interface LoadedHook {
    name: string;
    fn: HookFn;
}

function ipcSend(frame: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
        process.stdout.write(JSON.stringify(frame) + "\n", () => resolve());
    });
}

async function loadHooks(): Promise<LoadedHook[]> {
    const hooks: LoadedHook[] = [];
    let files: string[] = [];
    try {
        files = await readdir(hooksDir);
    } catch {
        return hooks;
    }
    for (const file of HOOK_FILES) {
        if (!files.includes(file))
            continue;
        try {
            const mod = await import(pathToFileURL(join(hooksDir, file)).href);
            if (typeof mod.default !== "function") {
                await ipcSend({ type: "load_error", file, error: "no default export" });
                continue;
            }
            hooks.push({ name: file.slice(0, -4), fn: mod.default });
        } catch (error) {
            await ipcSend({ type: "load_error", file, error: String((error as Error)?.message ?? error) });
        }
    }
    return hooks;
}

async function runHook(hook: LoadedHook, ctx: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const origWrite = process.stdout.write.bind(process.stdout);
    const origLog = console.log;
    let timer: ReturnType<typeof setTimeout> | undefined;
    process.stdout.write = ((chunk: any, ...args: any[]) => process.stderr.write(chunk, ...args)) as typeof process.stdout.write;
    console.log = (...args: unknown[]) => process.stderr.write(args.map(String).join(" ") + "\n");
    try {
        await Promise.race([
            Promise.resolve(hook.fn(ctx)),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("soft-timeout")), softTimeoutMs);
            }),
        ]);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: String((error as Error)?.message ?? error) };
    } finally {
        if (timer) clearTimeout(timer);
        process.stdout.write = origWrite;
        console.log = origLog;
    }
}

const hooks = await loadHooks();
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
    let msg: any;
    try {
        msg = JSON.parse(line);
    } catch {
        continue;
    }
    if (msg.type === "exit")
        break;
    if (msg.type !== "event" || !msg.event)
        continue;
    const name = String(msg.event.name ?? "");
    const matching = hooks.filter((hook) => hook.name === name);
    let ok = true;
    let error: string | undefined;
    const started = Date.now();
    for (const hook of matching) {
        const result = await runHook(hook, {
            ...(msg.ctx && typeof msg.ctx === "object" ? msg.ctx : {}),
            name,
            event: msg.event.event,
        });
        if (!result.ok) {
            ok = false;
            error = result.error;
            break;
        }
    }
    await ipcSend({ type: "result", id: msg.id, ok, error, durationMs: Date.now() - started });
}
rl.close();
process.exit(0);
