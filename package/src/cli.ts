/**
 * CLI argument parsing.
 *
 * \`fastcode\` launches the TUI. The non-interactive helpers let you configure
 * and script FastCode straight from a Termux shell, without starting Ink:
 * provider/model selection, config paths, skills, doctor and update.
 */
import meow from "meow";
import { readPackageMeta } from "./lib/pkg.js";
import { installSkill, listInstalledSkills, uninstallSkill, searchRegistry } from "./skills/manager.js";
import { loadConfig, saveConfig, resolveProviderKey } from "./config/store.js";
import { getPaths } from "./config/paths.js";
import { PROVIDERS, getProvider } from "./providers/index.js";
import { collectDiagnostics, formatDiagnostics } from "./lib/diagnostics.js";
import { latestSessionFile, listSessions, readSession, resolveSessionFile } from "./session/log.js";
import { listTrusted, trustProject, untrustProject } from "./config/trust.js";
const NL = String.fromCharCode(10);
const HELP = [
    "",
    "  FastCode — multi-LLM TUI coding assistant",
    "",
    "  Usage",
    "    $ fastcode                       Launch the TUI",
    "    $ fastcode \"explain this repo\"   Launch the TUI with an initial prompt",
    "",
    "  Model & provider (no TUI needed)",
    "    $ fastcode provider              List providers",
    "    $ fastcode provider <id>         Set the default provider",
    "    $ fastcode model                 List models for the current provider",
    "    $ fastcode model <id>            Set the default model",
    "    $ fastcode config                Print config file and data paths",
    "    $ fastcode config path           Print just the config file path",
    "    $ fastcode sessions              List saved sessions (JSONL)",
    "    $ fastcode sessions show <id>    Print a saved session",
    "    $ fastcode resume [id|latest]    Resume a saved session in the TUI",
    "",
    "  Trust (first-run safety)",
    "    $ fastcode trust [dir]           Trust a folder (enables agent tools)",
    "    $ fastcode untrust [dir]         Revoke trust for a folder",
    "    $ fastcode trusted               List trusted folders",
    "",
    "  Skills & maintenance",
    "    $ fastcode skills list           Print installed skills",
    "    $ fastcode skills install <id>   Install a skill from the registry",
    "    $ fastcode skills uninstall <id> Remove an installed skill",
    "    $ fastcode skills search <q>     Search the registry",
    "    $ fastcode doctor                Environment diagnostics (Termux/mobile)",
    "    $ fastcode update                Check for a newer release",
    "",
    "  Options",
    "    --version, -v   Show version",
    "    --help, -h      Show this help",
    "",
    "  Files (on Termux, edit them directly with nano):",
    "    config.json   provider, model, theme, agent mode, enabled skills",
    "    auth.json     API keys only, kept in a SEPARATE file (chmod 0600)",
    "",
    "  API keys may also come from ENV (DEEPSEEK_API_KEY, ANTHROPIC_API_KEY,",
    "  OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY,",
    "  MISTRAL_API_KEY, XAI_API_KEY, MOONSHOT_API_KEY, ZHIPUAI_API_KEY,",
    "  DASHSCOPE_API_KEY) or from /login inside the TUI.",
    "  Override the data directory with FASTCODE_HOME.",
    "",
].join(NL);
export async function parseCli(): Promise<any> {
    const cli = meow(HELP, {
        importMeta: import.meta,
        flags: {
            version: { type: "boolean", shortFlag: "v" },
        },
        autoHelp: true,
        autoVersion: true,
    });
    // First positional dictates the sub-command. Anything else is a prompt.
    const [first, ...rest] = cli.input;
    if (first === "provider") {
        const cfg = loadConfig();
        const paths = getPaths();
        if (rest.length === 0) {
            const lines = ["Providers (current: " + cfg.providerId + ")"];
            for (const p of PROVIDERS) {
                const marker = p.id === cfg.providerId ? "●" : " ";
                const auth = p.authEnv.length === 0 ? "(no key needed)" : "[" + p.authEnv.join(", ") + "]";
                lines.push("  " + marker + " " + p.id.padEnd(12) + " " + p.label + "  " + auth);
            }
            lines.push("");
            lines.push("Switch:  fastcode provider <id>");
            lines.push("Or edit: " + paths.config);
            console.log(lines.join(NL));
            return { done: true };
        }
        const next = getProvider(rest[0]);
        if (!next) {
            console.error("Unknown provider: " + rest[0] + ". Run: fastcode provider");
            process.exit(1);
        }
        saveConfig({ ...cfg, providerId: next.id, model: next.defaultModel });
        console.log("Provider: " + next.id + " (" + next.label + ")");
        console.log("Model:    " + next.defaultModel);
        console.log("Saved to " + paths.config);
        console.log("API keys stay in " + paths.auth + " (untouched)");
        return { done: true };
    }
    if (first === "model") {
        const cfg = loadConfig();
        const paths = getPaths();
        if (rest.length === 0) {
            const provider = getProvider(cfg.providerId);
            console.log("Provider: " + cfg.providerId + "   Model: " + cfg.model);
            if (provider) {
                let models = [];
                try {
                    const { key } = resolveProviderKey(provider.id, provider.authEnv);
                    models = await provider.listModels(key);
                }
                catch {
                    models = [];
                }
                if (models.length > 0) {
                    console.log("");
                    console.log("Known models for " + provider.label + " (use /model in the TUI for the live list):");
                    for (const m of models.slice(0, 40)) {
                        const marker = m.id === cfg.model ? "●" : " ";
                        console.log("  " + marker + " " + m.id + (m.label ? "  — " + m.label : ""));
                    }
                }
            }
            console.log("");
            console.log("Switch:  fastcode model <id>");
            console.log("Or edit: " + paths.config);
            return { done: true };
        }
        const id = rest.join(" ");
        saveConfig({ ...cfg, model: id });
        console.log("Model: " + id + "   (provider " + cfg.providerId + ")");
        console.log("Saved to " + paths.config);
        return { done: true };
    }
    if (first === "config") {
        const paths = getPaths();
        if (rest[0] === "path") {
            console.log(paths.config);
            return { done: true };
        }
        const cfg = loadConfig();
        console.log("Config file: " + paths.config);
        console.log("Keys file:   " + paths.auth + "   (separate file, chmod 0600)");
        console.log("");
        console.log(JSON.stringify(cfg, null, 2));
        return { done: true };
    }
    if (first === "sessions") {
        const all = listSessions();
        if (all.length === 0) {
            console.log("No sessions yet. They are appended to " + getPaths().sessions);
            return { done: true };
        }
        if (rest[0] === "show") {
            const entries = readSession(rest[1] ?? all[0].id);
            for (const entry of entries) {
                if (entry.type === "message")
                    console.log("[" + entry.role + "] " + entry.content);
                else
                    console.log("[" + entry.type + "]");
            }
            return { done: true };
        }
        console.log("Sessions (newest first):");
        for (const entry of all.slice(0, 20)) {
            console.log("  " + entry.id + "   " + (entry.bytes / 1024).toFixed(1) + "KB   " + entry.messages + " msgs   " + entry.modified);
        }
        console.log("");
        console.log("Resume:  fastcode resume [id|latest]");
        console.log("Show:    fastcode sessions show <id>");
        return { done: true };
    }
    if (first === "resume") {
        const target = rest[0];
        const file = !target || target === "latest" ? latestSessionFile() : resolveSessionFile(target);
        if (!file) {
            console.error("No saved session to resume. Start one with: fastcode");
            process.exit(1);
        }
        console.log("Resuming " + file);
        return { done: false, resume: file };
    }
    if (first === "trust" || first === "untrust" || first === "trusted") {
        if (first === "trusted") {
            const all = listTrusted();
            if (all.length === 0) {
                console.log("No trusted folders yet. Run: fastcode trust");
                return { done: true };
            }
            for (const entry of all)
                console.log("  " + entry.path + "   (" + entry.addedAt + ")");
            return { done: true };
        }
        const dir = rest[0] ?? process.cwd();
        if (first === "trust") {
            console.log("Trusted: " + trustProject(dir));
        }
        else {
            console.log(untrustProject(dir) ? "Removed from the trusted list: " + dir : "Not in the trusted list: " + dir);
        }
        return { done: true };
    }
    if (first === "skills") {
        const sub = rest[0] ?? "list";
        const args = rest.slice(1);
        if (sub === "list" || sub === "ls") {
            const installed = listInstalledSkills();
            if (installed.length === 0) {
                console.log("No skills installed. Try: fastcode skills install <id>");
            }
            else {
                for (const s of installed)
                    console.log(s.name + "\t" + s.source + "\t" + s.path);
            }
            return { done: true };
        }
        if (sub === "install" || sub === "add") {
            if (args.length === 0) {
                console.error("Usage: fastcode skills install <id|owner/repo|url>");
                process.exit(1);
            }
            const cfg = loadConfig();
            const force = args.includes("--force");
            const spec = args.filter((a) => a !== "--force").join(" ");
            const skill = await installSkill(spec, { registry: cfg.skillsRegistry, force });
            console.log("Installed " + skill.name + " -> " + skill.path);
            return { done: true };
        }
        if (sub === "uninstall" || sub === "remove" || sub === "rm") {
            if (args.length === 0) {
                console.error("Usage: fastcode skills uninstall <id>");
                process.exit(1);
            }
            const ok = uninstallSkill(args[0]);
            console.log(ok ? "Removed " + args[0] + "." : "No skill named " + args[0] + ".");
            return { done: true };
        }
        if (sub === "search") {
            if (args.length === 0) {
                console.error("Usage: fastcode skills search <query>");
                process.exit(1);
            }
            const cfg = loadConfig();
            const hits = await searchRegistry(args.join(" "), cfg.skillsRegistry);
            if (hits.length === 0)
                console.log("No matches.");
            for (const h of hits.slice(0, 20)) {
                console.log(h.slug + "\t" + (h.description ?? ""));
            }
            return { done: true };
        }
        console.error("Unknown skills sub-command: " + sub);
        process.exit(1);
    }
    if (first === "doctor") {
        console.log(formatDiagnostics(collectDiagnostics()));
        return { done: true };
    }
    if (first === "update") {
        console.log(await updateReport());
        return { done: true };
    }
    // No sub-command → treat all positionals as the initial prompt.
    const prompt = cli.input.length > 0 ? cli.input.join(" ") : undefined;
    return prompt ? { prompt, done: false } : { done: false };
}
function compareVersions(a, b) {
    const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0)
            return d > 0 ? 1 : -1;
    }
    return 0;
}
async function updateReport() {
    const meta = readPackageMeta();
    const lines = ["FastCode " + meta.version, ""];
    const registry = process.env["FASTCODE_UPDATE_REGISTRY"] ??
        "https://registry.npmjs.org/" + encodeURIComponent(meta.name) + "/latest";
    try {
        const res = await fetch(registry, { headers: { accept: "application/json" } });
        if (!res.ok)
            throw new Error(res.status + " " + res.statusText);
        const payload: any = await res.json();
        const latest = payload.version;
        const cmp = compareVersions(latest, meta.version);
        lines.push("Published latest: " + latest);
        lines.push(cmp > 0
            ? "Update available: " + meta.version + " -> " + latest
            : cmp < 0
                ? "This build (" + meta.version + ") is newer than the published " + latest + "."
                : "You are up to date.");
    }
    catch (err) {
        lines.push("Could not reach the registry: " + err.message);
    }
    lines.push("");
    lines.push("Update with one of:");
    lines.push("  npm install -g " + meta.name + "@latest");
    lines.push("  # or from a checkout:  git pull && npm install -g .");
    return lines.join(NL);
}
