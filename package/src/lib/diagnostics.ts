/**
 * Environment diagnostics for mobile / Termux troubleshooting.
 *
 * `fastcode doctor` prints the values below so a broken mobile install can be
 * diagnosed without opening the TUI: Node version, Termux detection, whether
 * stdout is a real terminal, the config root, and which provider keys exist.
 */
import { detectPlatform, platformLabel } from "./platform.js";
import { readPackageMeta } from "./pkg.js";
import { shouldUseStableTerminalUi } from "./uiMode.js";
import { getPaths } from "../config/paths.js";
import { loadConfig, resolveApiKey, resolveProviderKey } from "../config/store.js";
import { PROVIDERS } from "../providers/index.js";
import { listInstalledSkills } from "../skills/manager.js";
import { listInstalledPlugins } from "../plugins/manager.js";
import { loggingEnabled, listSessions, sessionCacheLimitBytes } from "../session/log.js";
import { isTrusted } from "../config/trust.js";
import { DEFAULT_DENY_PATTERNS } from "../agent/guards.js";
import { toolOutputLimit } from "../agent/limits.js";
const NODE_REQUIRED = "18.17";
function readVersion() {
    return readPackageMeta().version;
}
function nodeIsSupported() {
    const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
    const [reqMajor = 0, reqMinor = 0] = NODE_REQUIRED.split(".").map(Number);
    return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}
export function collectDiagnostics() {
    const config = loadConfig();
    let paths;
    try {
        paths = getPaths();
    }
    catch {
        paths = undefined;
    }
    const provider = PROVIDERS.find((p) => p.id === config.providerId);
    const keyLookup = provider && provider.authEnv.length > 0
        ? resolveApiKey(provider.id, config.model, provider.authEnv)
        : { status: "ok" as const };
    const keyPresent = Boolean(provider) && (provider.authEnv.length === 0 || keyLookup.status === "ok");
    let skillsInstalled = 0;
    let pluginsInstalled = 0;
    try {
        skillsInstalled = listInstalledSkills().length;
    }
    catch {
        // A broken skills dir must not break the whole report.
    }
    try {
        pluginsInstalled = listInstalledPlugins().length;
    }
    catch {
        // Same for plugins.
    }
    const platform = detectPlatform();
    return {
        version: readVersion(),
        node: process.version,
        nodeRequired: NODE_REQUIRED,
        nodeOk: nodeIsSupported(),
        platform,
        platformLabel: platformLabel(),
        termux: platform === "termux",
        termuxVersion: process.env["TERMUX_VERSION"] ?? null,
        stableUi: shouldUseStableTerminalUi(),
        tty: Boolean(process.stdout.isTTY),
        configRoot: paths?.root,
        configFile: paths?.config,
        authFile: paths?.auth,
        providerId: config.providerId,
        model: config.model,
        keyPresent,
        keyStatus: provider ? keyLookup.status : "missing",
        keyEnv: provider?.authEnv?.[0],
        skillsInstalled,
        pluginsInstalled,
        enabledSkills: (config.enabledSkills ?? []).length,
        enabledPlugins: (config.enabledPlugins ?? []).length,
        sessionLogEnabled: loggingEnabled(),
        sessionCacheMb: Math.round(sessionCacheLimitBytes() / (1024 * 1024)),
        sessionsDir: paths?.sessions,
        sessionsCount: listSessions().length,
        sessionsBytes: listSessions().reduce((sum, entry) => sum + entry.bytes, 0),
        trustFile: paths?.trust,
        trusted: isTrusted(process.cwd()),
        shellDenyPatterns: DEFAULT_DENY_PATTERNS.length,
        allowDangerous: ["1", "true", "yes", "on"].includes((process.env["FASTCODE_ALLOW_DANGEROUS"] ?? "").trim().toLowerCase()),
        toolOutputLimit: toolOutputLimit(),
        providers: PROVIDERS.map((p) => ({
            id: p.id,
            label: p.label,
            env: p.authEnv,
            keyPresent: p.authEnv.length === 0 || Boolean(resolveProviderKey(p.id, p.authEnv).key),
        })),
    };
}
export function formatDiagnostics(info) {
    const lines = [];
    lines.push(`FastCode ${info.version} — environment check`);
    lines.push("");
    lines.push(`  node          ${info.node}  (needs >= ${info.nodeRequired})  [${info.nodeOk ? "ok" : "TOO OLD"}]`);
    lines.push(`  platform      ${info.platformLabel}${info.termux ? " (Termux)" : ""}`);
    lines.push(`  terminal      ${info.tty ? "interactive TTY" : "NOT a TTY — the TUI needs a real terminal"}`);
    lines.push(`  stable UI     ${info.stableUi ? "on (anti-flicker)" : "off"}`);
    lines.push("  config root   " + (info.configRoot ?? "(unavailable)"));
    lines.push("  config file   " + (info.configFile ?? "(unavailable)"));
    lines.push("  keys file     " + (info.authFile ?? "(unavailable)") + "   (separate, chmod 0600)");
    lines.push("  trusted cwd   " + (info.trusted ? "yes" : "NO - agent tools ask first or stay off") + "   (" + (info.trustFile ?? "?") + ")");
    lines.push("  session log   " + (info.sessionLogEnabled ? "on" : "off") + "   cache cap " + info.sessionCacheMb + "MB, " + info.sessionsCount + " file(s), " + (info.sessionsBytes / 1024 / 1024).toFixed(2) + "MB used");
    lines.push("  session dir   " + (info.sessionsDir ?? "(unavailable)"));
    lines.push("  shell guard   " + info.shellDenyPatterns + " deny patterns" + (info.allowDangerous ? "   [FASTCODE_ALLOW_DANGEROUS is ON]" : ""));
    lines.push("  tool output   " + info.toolOutputLimit + " chars max (streaming cap)");
    lines.push(`  provider      ${info.providerId} · model ${info.model}`);
    let apiKeyStatus;
    if (info.keyPresent)
        apiKeyStatus = "present";
    else if (info.keyStatus === "unbound")
        apiKeyStatus = `UNBOUND — a stored ${info.providerId} key isn't tied to a model; re-bind with /login ${info.providerId} ${info.model} <key>`;
    else
        apiKeyStatus = `MISSING — set ${info.keyEnv ?? "the provider env var"} or /login ${info.providerId} ${info.model} <key>`;
    lines.push(`  api key       ${apiKeyStatus}`);
    lines.push(`  skills        ${info.skillsInstalled} installed, ${info.enabledSkills} enabled`);
    lines.push(`  plugins       ${info.pluginsInstalled} installed, ${info.enabledPlugins} enabled`);
    lines.push("");
    lines.push("  provider keys:");
    for (const p of info.providers) {
        lines.push(`    ${p.keyPresent ? "●" : "○"} ${p.id.padEnd(12)} ${p.env.join(" / ") || "(no key needed)"}`);
    }
    if (info.termux) {
        lines.push("");
        lines.push("  Termux tips:");
        lines.push("    - pkg install nodejs git");
        lines.push("    - keep the session alive with: termux-wake-lock");
        lines.push("    - add an extra-keys row for Esc/Ctrl in ~/.termux/termux.properties");
    }
    return lines.join("\n");
}
