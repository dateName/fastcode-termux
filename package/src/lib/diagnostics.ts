/**
 * Environment diagnostics for mobile / Termux troubleshooting.
 *
 * `fastcode doctor` prints the values below so a broken mobile install can be
 * diagnosed without opening the TUI: Node version, Termux detection, whether
 * stdout is a real terminal, the config root, and which provider keys exist.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { totalmem, freemem, tmpdir as osTmpdir } from "node:os";
import { detectPlatform, platformLabel } from "./platform.js";
import { readPackageMeta } from "./pkg.js";
import { shouldUseStableTerminalUi } from "./uiMode.js";
import { getPaths } from "../config/paths.js";
import { configCacheStatus, loadConfig, resolveApiKey, resolveProviderKey } from "../config/store.js";
import { debugEnabled } from "./debug.js";
import { PROVIDERS } from "../providers/index.js";
import { CATALOG_PROVIDERS } from "../providers/catalog.js";
import { listInstalledSkills, resolveRegistry } from "../skills/manager.js";
import { listInstalledPlugins } from "../plugins/manager.js";
import { findUnclosedSessions, fsyncMode, loggingEnabled, listSessions, sessionCacheLimitBytes } from "../session/log.js";
import { isTrusted } from "../config/trust.js";
import { DEFAULT_DENY_PATTERNS, loopExemptTools } from "../agent/guards.js";
import { toolMessageLimit, toolOutputLimit } from "../agent/limits.js";
import { grepMaxBytes, readManyMaxBytes, readMaxBytes, readScanMaxBytes } from "../agent/tools/readers.js";
import { normalizeEgressConfig } from "../agent/policy/egress.js";
import { compactionConfigFromEnv, heapExceeded } from "../agent/compaction.js";
import { shellPoolStats } from "../agent/shell-session.js";
import { resolveToolProtocol, runtimeToolCapability } from "../agent/protocol-mode.js";
import { getModelMeta, modelMetaOverridePath } from "./model-meta.js";
import { getLocale } from "../i18n/index.js";
const NODE_REQUIRED = "18.17";
function readVersion() {
    return readPackageMeta().version;
}
function nodeIsSupported() {
    const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
    const [reqMajor = 0, reqMinor = 0] = NODE_REQUIRED.split(".").map(Number);
    return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}
/** Largest run of identical consecutive tool_call facts in the latest session. */
function latestRepeatStats() {
    const latest = listSessions()[0];
    if (!latest)
        return null;
    try {
        let previous = "";
        let run = 0;
        let best = { session: latest.id, tool: "", count: 0 };
        for (const line of readFileSync(latest.file, "utf8").split(/\r?\n/)) {
            if (!line.trim())
                continue;
            let fact;
            try {
                fact = JSON.parse(line);
            }
            catch {
                continue;
            }
            if (fact?.type !== "tool_call")
                continue;
            const key = String(fact.tool ?? "") + "\u0000" + JSON.stringify(fact.args ?? {});
            run = key === previous ? run + 1 : 1;
            previous = key;
            if (run > best.count)
                best = { session: latest.id, tool: String(fact.tool ?? "?"), count: run };
        }
        return best;
    }
    catch {
        return null;
    }
}
export function collectDiagnostics() {
    const config = loadConfig();
    const egress = normalizeEgressConfig(config.egress);
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
    const compaction = compactionConfigFromEnv();
    const shells = shellPoolStats();
    const recentRepeats = latestRepeatStats();
    let authMode = "missing";
    try {
        if (paths?.auth && existsSync(paths.auth))
            authMode = (statSync(paths.auth).mode & 0o777).toString(8).padStart(4, "0");
    }
    catch {
        authMode = "unreadable";
    }
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
        language: getLocale(),
        tty: Boolean(process.stdout.isTTY),
        configRoot: paths?.root,
        configFile: paths?.config,
        authFile: paths?.auth,
        authMode,
        tmpdir: process.env["TMPDIR"] || osTmpdir(),
        memTotalMb: totalmem() / 1024 / 1024,
        memFreeMb: freemem() / 1024 / 1024,
        providerId: config.providerId,
        model: config.model,
        keyPresent,
        keyStatus: provider ? keyLookup.status : "missing",
        keyEnv: provider?.authEnv?.[0],
        skillsInstalled,
        skillsRegistry: resolveRegistry(process.env["FASTCODE_SKILLS_REGISTRY"], config.skillsRegistry),
        debug: debugEnabled(),
        configCache: configCacheStatus().cached,
        pluginsInstalled,
        enabledSkills: (config.enabledSkills ?? []).length,
        enabledPlugins: (config.enabledPlugins ?? []).length,
        sessionLogEnabled: loggingEnabled(),
        sessionCacheMb: Math.round(sessionCacheLimitBytes() / (1024 * 1024)),
        sessionFsync: fsyncMode(),
        unclosedSessions: findUnclosedSessions().length,
        sessionsDir: paths?.sessions,
        sessionsCount: listSessions().length,
        sessionsBytes: listSessions().reduce((sum, entry) => sum + entry.bytes, 0),
        recentRepeatSession: recentRepeats?.session ?? null,
        recentRepeatTool: recentRepeats?.tool || null,
        recentRepeatCount: recentRepeats?.count ?? 0,
        trustFile: paths?.trust,
        trusted: isTrusted(process.cwd()),
        shellDenyPatterns: DEFAULT_DENY_PATTERNS.length,
        allowDangerous: ["1", "true", "yes", "on"].includes((process.env["FASTCODE_ALLOW_DANGEROUS"] ?? "").trim().toLowerCase()),
        toolOutputLimit: toolOutputLimit(),
        toolMessageLimit: toolMessageLimit(),
        readMaxBytes: readMaxBytes(),
        readScanMaxBytes: readScanMaxBytes(),
        readManyMaxBytes: readManyMaxBytes(),
        grepMaxBytes: grepMaxBytes(),
        egress: {
            enabled: egress.enabled,
            mode: egress.mode,
            maxScanBytes: egress.maxScanBytes,
            denyPaths: egress.denyPaths.length,
            denyGlobs: egress.denyGlobs.length,
            denyContentMarkers: egress.denyContentMarkers.length,
            scanToolOutput: egress.scanToolOutput,
        },
        tokenBudget: positiveEnv("FASTCODE_TOKEN_BUDGET"),
        costBudgetUsd: positiveEnv("FASTCODE_COST_BUDGET_USD"),
        compactionEnabled: compaction.enabled,
        compactionRatio: compaction.localThresholdRatio,
        compactionKeepTurns: compaction.keepTurns,
        compactionSummaryTokens: compaction.maxSummaryTokens,
        compactionHeapMb: compaction.heapLimitMb,
        compactionHeapUsedMb: process.memoryUsage().heapUsed / 1024 / 1024,
        compactionForced: heapExceeded(compaction),
        serverCompactionAware: compaction.serverCompactionAware,
        shellActive: shells.active,
        shellPool: shells.pool,
        shellPoolMax: shells.maxPool,
        shellSpawns: shells.spawns,
        shellMaxSpawn: shells.maxSpawnPerTurn,
        requestIdleMs: Number(config.requestIdleTimeoutMs) > 0 ? Number(config.requestIdleTimeoutMs) : 60_000,
        sseIdleMs: positiveEnv("FASTCODE_SSE_IDLE_MS") || 25_000,
        customAuthHeader: (process.env["FASTCODE_AUTH_HEADER"] ?? "").trim() || null,
        customAuthPrefix: process.env["FASTCODE_AUTH_PREFIX"] !== undefined,
        customAuthExtraHeaders: Boolean((process.env["FASTCODE_EXTRA_HEADERS"] ?? "").trim()),
        toolProtocol: resolveToolProtocol(config, config.providerId, config.model),
        stdioBackend: process.env["FASTCODE_STDIO_COMMAND"] ? "configured" : "off",
        toolProtocolMode: (process.env["FASTCODE_TOOL_PROTOCOL"] ?? "auto").trim().toLowerCase(),
        toolCapability: runtimeToolCapability(config.providerId, config.model) ?? "unknown",
        loopExempt: Array.from(loopExemptTools()),
        modelMetaFile: modelMetaOverridePath(),
        modelMeta: getModelMeta(config.providerId, config.model),
        providers: PROVIDERS.map((p) => ({
            id: p.id,
            label: p.label,
            env: p.authEnv,
            keyPresent: p.authEnv.length === 0 || Boolean(resolveProviderKey(p.id, p.authEnv).key),
        })),
        providerCount: PROVIDERS.length,
        catalogCount: CATALOG_PROVIDERS.length,
    };
}
function positiveEnv(name) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}
export function formatDiagnostics(info) {
    const lines = [];
    lines.push(`FastCode ${info.version} — environment check`);
    lines.push("");
    lines.push(`  node          ${info.node}  (needs >= ${info.nodeRequired})  [${info.nodeOk ? "ok" : "TOO OLD"}]`);
    lines.push(`  platform      ${info.platformLabel}${info.termux ? " (Termux)" : ""}`);
    lines.push(`  terminal      ${info.tty ? "interactive TTY" : "NOT a TTY — the TUI needs a real terminal"}`);
    lines.push(`  stable UI     ${info.stableUi ? "on (anti-flicker)" : "off"}`);
    lines.push(`  language      ${info.language}${process.env["FASTCODE_LANG"] ? " (FASTCODE_LANG)" : ""}`);
    lines.push("  config root   " + (info.configRoot ?? "(unavailable)"));
    lines.push("  config file   " + (info.configFile ?? "(unavailable)"));
    lines.push("  keys file     " + (info.authFile ?? "(unavailable)") + "   mode " + info.authMode + (info.authMode !== "missing" && info.authMode !== "0600" ? "  [WARN: expected 0600]" : ""));
    lines.push("  tmpdir        " + info.tmpdir + (info.termux && !String(info.tmpdir).startsWith("/data/data/com.termux") ? "  [WARN: use $PREFIX/tmp]" : ""));
    lines.push("  memory        " + info.memFreeMb.toFixed(0) + "MB free / " + info.memTotalMb.toFixed(0) + "MB total");
    lines.push("  trusted cwd   " + (info.trusted ? "yes" : "NO - agent tools ask first or stay off") + "   (" + (info.trustFile ?? "?") + ")");
    lines.push("  session log   " + (info.sessionLogEnabled ? "on" : "off") + "   cache cap " + info.sessionCacheMb + "MB, " + info.sessionsCount + " file(s), " + (info.sessionsBytes / 1024 / 1024).toFixed(2) + "MB used");
    lines.push("  session fsync " + info.sessionFsync + "   unclosed " + info.unclosedSessions + "   " + (info.sessionsDir ?? "(unavailable)"));
    lines.push("  repeats       " + (info.recentRepeatSession
        ? (info.recentRepeatCount > 1
            ? `latest session ran ${info.recentRepeatTool} ×${info.recentRepeatCount} consecutively (${info.recentRepeatSession})`
            : `none in the latest session (${info.recentRepeatSession})`)
        : "no session log yet"));
    lines.push("  shell guard   " + info.shellDenyPatterns + " legacy soft patterns" + (info.allowDangerous ? "   [FASTCODE_ALLOW_DANGEROUS is ON]" : ""));
    lines.push("  tool output   " + info.toolOutputLimit + " chars max (streaming cap) · " + info.toolMessageLimit + " chars per tool message");
    lines.push(`  read limits   read ${info.readMaxBytes}B · scan ${info.readScanMaxBytes}B · read_many ${info.readManyMaxBytes}B · grep ${info.grepMaxBytes}B`);
    lines.push(`  egress        ${info.egress.enabled ? "enforce" : "audit-only"} · mode ${info.egress.mode} · scan ${info.egress.maxScanBytes}B · paths ${info.egress.denyPaths} · globs ${info.egress.denyGlobs} · markers ${info.egress.denyContentMarkers}`);
    lines.push(`  budgets       ${info.tokenBudget > 0 ? "tokens ≤ " + info.tokenBudget : "token budget off"} · ${info.costBudgetUsd > 0 ? "$" + info.costBudgetUsd : "cost budget off"}`);
    lines.push(`  compaction    ${info.compactionEnabled ? "on" : "off"} · ${Math.round(info.compactionRatio * 100)}% · keep ${info.compactionKeepTurns} turns · summary ${info.compactionSummaryTokens} tok · heap ${info.compactionHeapUsedMb.toFixed(1)}/${info.compactionHeapMb}MB${info.compactionForced ? " [FORCED]" : ""}${info.serverCompactionAware ? " · server-aware" : ""}`);
    lines.push(`  shell pool    ${info.shellActive} active · ${info.shellPool}/${info.shellPoolMax} resident · ${info.shellSpawns} spawns · cap ${info.shellMaxSpawn}/turn`);
    lines.push(`  loop exempt   ${info.loopExempt.length > 0 ? info.loopExempt.join(", ") : "(none)"}`);
    lines.push(`  model meta    ctx ${info.modelMeta.contextWindow} · ~${info.modelMeta.charsPerToken} chars/token · ${info.modelMeta.supportsTools ? "tools" : "no tools"} · ${info.modelMetaFile}`);
    lines.push(`  sse timeout   ${info.requestIdleMs}ms request idle (config) · ${info.sseIdleMs}ms env fallback`);
    lines.push(`  tool protocol ${info.toolProtocol} (${info.toolProtocolMode}) · runtime ${info.toolCapability}`);
    lines.push(`  provider      ${info.providerId} · model ${info.model}`);
    lines.push(`  stdio backend ${info.stdioBackend}${info.stdioBackend === "configured" ? " (FASTCODE_STDIO_COMMAND)" : ""}`);
    if (info.customAuthHeader || info.customAuthPrefix || info.customAuthExtraHeaders) {
        lines.push(`  custom auth   header ${info.customAuthHeader ?? "authorization"}` +
            `${info.customAuthPrefix ? " · prefix set" : ""}${info.customAuthExtraHeaders ? " · extra headers set" : ""}`);
    }
    lines.push(`  provider list ${info.providerCount} total (${info.catalogCount} catalog)`);
    lines.push(`  config cache  ${info.configCache ? "warm" : "cold"} · debug ${info.debug ? "on" : "off"}`);
    let apiKeyStatus;
    if (info.keyPresent)
        apiKeyStatus = "present";
    else if (info.keyStatus === "unbound")
        apiKeyStatus = `UNBOUND — a stored ${info.providerId} key isn't tied to a model; re-bind with /login ${info.providerId} ${info.model} <key>`;
    else
        apiKeyStatus = `MISSING — set ${info.keyEnv ?? "the provider env var"} or /login ${info.providerId} ${info.model} <key>`;
    lines.push(`  api key       ${apiKeyStatus}`);
    lines.push(`  skills        ${info.skillsInstalled} installed, ${info.enabledSkills} enabled (${info.skillsRegistry || "no registry configured"})`);
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
        lines.push("    - long tasks: export TMPDIR=$PREFIX/tmp and use termux-wake-lock");
        lines.push(`    - Android 12+ caps phantom processes (~32); background shells are pooled (${info.shellPool} resident, cap ${info.shellMaxSpawn}/turn)`);
    }
    return lines.join("\n");
}
