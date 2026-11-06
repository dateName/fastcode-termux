/**
 * Application-layer egress policy.
 *
 * This is intentionally a pure policy module plus a thin registry hook. It is
 * not a kernel and cannot stop code that bypasses FastCode's tool registry.
 *
 * Default posture: audit only (`enabled:false`, `mode:"audit"`). Set
 * `egress.enabled=true` and `egress.mode="block"` to enforce.
 */
import { basename, relative, resolve } from "node:path";
import { isCriticalReadTarget, isSensitiveTarget, isSharedStoragePath } from "../guards.js";
import type { EgressAudit, ToolCall } from "../tools/types.js";
import { DEFAULT_CONTENT_MARKERS, DEFAULT_EGRESS_CONFIG, type EgressConfig, type EgressMode } from "./defaults.js";

export type { EgressConfig, EgressMode } from "./defaults.js";
export { DEFAULT_CONTENT_MARKERS, DEFAULT_EGRESS_CONFIG } from "./defaults.js";

export type EgressAction = "read" | "write" | "delete" | "egress" | "payload";

export interface EgressSubject {
    outlet: string;
    action: EgressAction;
    target?: string;
    payload?: string;
    outbound?: boolean;
}

export interface EgressDecision {
    outlet: string;
    target?: string;
    rule: string;
    mode: EgressMode;
    wouldBlock: boolean;
    code: "EGRESS_DENY";
    reason: string;
}

export interface EgressEvaluation {
    action: "allow" | "audit" | "deny";
    decision?: EgressDecision;
}

function strings(value: any): string[] {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim()) : [];
}

function positiveInt(value: any, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function normalizeEgressConfig(raw: any): EgressConfig {
    const source = raw && typeof raw === "object" ? raw : {};
    const mode: EgressMode = source.mode === "block" ? "block" : source.mode === "off" ? "off" : "audit";
    return {
        enabled: source.enabled === true,
        mode,
        denyPaths: strings(source.denyPaths),
        denyGlobs: strings(source.denyGlobs),
        // Built-in markers cannot be removed by configuration.
        denyContentMarkers: Array.from(new Set([...DEFAULT_CONTENT_MARKERS, ...strings(source.denyContentMarkers)])),
        maxScanBytes: positiveInt(source.maxScanBytes, DEFAULT_EGRESS_CONFIG.maxScanBytes),
        scanToolOutput: source.scanToolOutput !== false,
    };
}

interface CompiledPolicy {
    markers: RegExp[];
    globs: RegExp[];
    denyPaths: string[];
}

const compileCache = new Map<string, CompiledPolicy>();

function safeRegExp(pattern: string): RegExp | undefined {
    try {
        return new RegExp(pattern, "i");
    }
    catch {
        return undefined;
    }
}

function globToRegExp(glob: string): RegExp {
    let source = "^";
    for (let index = 0; index < glob.length; index += 1) {
        const char = glob[index];
        if (char === "*") {
            if (glob[index + 1] === "*") {
                source += ".*";
                index += 1;
                if (glob[index + 1] === "/")
                    index += 1;
            }
            else {
                source += "[^/]*";
            }
        }
        else if (char === "?") {
            source += "[^/]";
        }
        else if (/[.+^${}()|[\]\\]/.test(char)) {
            source += "\\" + char;
        }
        else {
            source += char;
        }
    }
    return new RegExp(source + "$", "i");
}

function compile(config: EgressConfig): CompiledPolicy {
    const key = JSON.stringify(config);
    const cached = compileCache.get(key);
    if (cached)
        return cached;
    const compiled: CompiledPolicy = {
        markers: config.denyContentMarkers.map(safeRegExp).filter(Boolean) as RegExp[],
        globs: config.denyGlobs.map(globToRegExp),
        denyPaths: config.denyPaths.map((entry) => resolve(entry).replace(/\\/g, "/")),
    };
    compileCache.set(key, compiled);
    if (compileCache.size > 8)
        compileCache.delete(compileCache.keys().next().value as string);
    return compiled;
}

function expandHome(target: string): string {
    const home = process.env["HOME"] || process.env["USERPROFILE"] || "";
    if (!home)
        return target;
    if (target === "~")
        return home;
    if (target.startsWith("~/") || target.startsWith("~\\"))
        return home + target.slice(1);
    return target.replace(/^\$(?:HOME|\{HOME\})/i, home);
}

function normalizeTarget(target: string, cwd: string): string {
    return resolve(cwd, expandHome(target)).replace(/\\/g, "/");
}

function isInside(child: string, parent: string): boolean {
    const rel = relative(parent, child).replace(/\\/g, "/");
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function markerHit(payload: string, compiled: CompiledPolicy): string | undefined {
    for (const marker of compiled.markers) {
        if (marker.test(payload))
            return marker.source;
    }
    return undefined;
}

function scanWindow(payload: string, maxBytes: number): string {
    if (Buffer.byteLength(payload, "utf8") <= maxBytes)
        return payload;
    const buffer = Buffer.from(payload, "utf8");
    const half = Math.max(1, Math.floor(maxBytes / 2));
    return `${buffer.subarray(0, half).toString("utf8")}\n${buffer.subarray(buffer.length - half).toString("utf8")}`;
}

function evaluateSubject(subject: EgressSubject, cwd: string, config: EgressConfig, compiled: CompiledPolicy): EgressDecision | undefined {
    const decide = (rule: string, reason: string): EgressDecision => ({
        outlet: subject.outlet,
        target: subject.target,
        rule,
        mode: config.mode,
        wouldBlock: true,
        code: "EGRESS_DENY",
        reason,
    });
    if (subject.action === "payload") {
        const payload = subject.payload ?? "";
        if (!payload)
            return undefined;
        const overBudget = Buffer.byteLength(payload, "utf8") > config.maxScanBytes;
        if (overBudget && subject.outbound)
            return decide("scan_budget_exceeded", `payload exceeds the ${config.maxScanBytes}-byte egress scan budget`);
        const marker = markerHit(scanWindow(payload, config.maxScanBytes), compiled);
        if (marker)
            return decide("content_marker", `payload matched denyContentMarkers (${marker})`);
        return undefined;
    }
    const target = subject.target;
    if (!target)
        return undefined;
    if (subject.action === "read" && isCriticalReadTarget(target))
        return decide("critical_credential_read", "reading a critical private key or system credential file");
    if (subject.action !== "read" && isSensitiveTarget(target))
        return decide("sensitive_path", "writing or deleting a protected credential/session file");
    if (subject.action !== "read" && isSharedStoragePath(target))
        return decide("shared_storage", "writing to shared storage is treated as an egress surface");
    const normalized = normalizeTarget(target, cwd);
    for (const denyPath of compiled.denyPaths) {
        if (isInside(normalized, denyPath))
            return decide("config:deny_path", `path matches denyPaths entry ${denyPath}`);
    }
    for (const glob of compiled.globs) {
        if (glob.test(normalized) || glob.test(basename(normalized)))
            return decide("config:deny_glob", "path matches a denyGlobs entry");
    }
    return undefined;
}

function pathSubject(outlet: string, action: EgressAction, target: unknown): EgressSubject | undefined {
    return typeof target === "string" && target ? { outlet, action, target } : undefined;
}

function patchTargets(patch: string): EgressSubject[] {
    const subjects: EgressSubject[] = [];
    const filePattern = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm;
    for (const match of patch.matchAll(filePattern)) {
        const action: EgressAction = match[1] === "Delete" ? "delete" : "write";
        subjects.push({ outlet: "apply_patch.path", action, target: match[2].trim() });
    }
    const movePattern = /^\*\*\* Move to: (.+)$/gm;
    for (const match of patch.matchAll(movePattern))
        subjects.push({ outlet: "apply_patch.move", action: "write", target: match[1].trim() });
    return subjects;
}

export function egressSubjects(call: ToolCall): EgressSubject[] {
    const subjects: EgressSubject[] = [];
    const add = (subject: EgressSubject | undefined) => {
        if (subject)
            subjects.push(subject);
    };
    switch (call.tool) {
        case "read_file":
        case "list_files":
        case "stat_path":
        case "grep":
            add(pathSubject(`${call.tool}.path`, "read", typeof call.path === "string" ? call.path : "."));
            break;
        case "read_many":
            if (Array.isArray(call.paths)) {
                for (const path of call.paths)
                    add(pathSubject("read_many.paths", "read", path));
            }
            break;
        case "write_file":
        case "append_file":
            add(pathSubject(`${call.tool}.path`, "write", call.path));
            if (typeof call.content === "string")
                subjects.push({ outlet: `${call.tool}.content`, action: "payload", payload: call.content, outbound: false });
            break;
        case "replace_in_file":
            add(pathSubject("replace_in_file.path", "write", call.path));
            if (typeof call.replace === "string")
                subjects.push({ outlet: "replace_in_file.replace", action: "payload", payload: call.replace, outbound: false });
            break;
        case "delete_file":
            add(pathSubject("delete_file.path", "delete", call.path));
            break;
        case "make_dir":
            add(pathSubject("make_dir.path", "write", call.path));
            break;
        case "copy_file":
            add(pathSubject("copy_file.from", "egress", call.from));
            add(pathSubject("copy_file.to", "write", call.to));
            break;
        case "move_path":
            add(pathSubject("move_path.from", "egress", call.from));
            add(pathSubject("move_path.to", "write", call.to));
            break;
        case "apply_patch":
            if (typeof call.patch === "string") {
                subjects.push({ outlet: "apply_patch.patch", action: "payload", payload: call.patch, outbound: false });
                subjects.push(...patchTargets(call.patch));
            }
            break;
        case "shell":
            if (typeof call.command === "string")
                subjects.push({ outlet: "shell.command", action: "payload", payload: call.command, outbound: true });
            break;
        default:
            break;
    }
    return subjects;
}

export function evaluateEgressCall(call: ToolCall, cwd: string, config: EgressConfig): EgressEvaluation {
    if (config.mode === "off")
        return { action: "allow" };
    const compiled = compile(config);
    for (const subject of egressSubjects(call)) {
        const decision = evaluateSubject(subject, cwd, config, compiled);
        if (!decision)
            continue;
        const enforce = config.enabled && config.mode === "block";
        return { action: enforce ? "deny" : "audit", decision };
    }
    return { action: "allow" };
}

export function evaluateEgressOutput(tool: string, output: string, config: EgressConfig): EgressEvaluation {
    if (!config.scanToolOutput || config.mode === "off" || !output)
        return { action: "allow" };
    const compiled = compile(config);
    const decision = evaluateSubject({
        outlet: `${tool}.output`,
        action: "payload",
        payload: output,
        outbound: true,
    }, process.cwd(), config, compiled);
    if (!decision)
        return { action: "allow" };
    const enforce = config.enabled && config.mode === "block";
    return { action: enforce ? "deny" : "audit", decision };
}

export function egressAudit(decision: EgressDecision): EgressAudit {
    return {
        outlet: decision.outlet,
        target: decision.target,
        rule: decision.rule,
        mode: decision.mode === "block" ? "block" : "audit",
        wouldBlock: decision.wouldBlock,
        code: decision.code,
        reason: decision.reason,
    };
}

export function formatEgressDenial(decision: EgressDecision): string {
    const target = decision.target ? ` target=${JSON.stringify(decision.target)}` : "";
    return `[egress] DENY rule=${decision.rule}${target} reason=${decision.reason}\n` +
        "This decision cannot be overridden by FASTCODE_ALLOW_DANGEROUS, trust, sharedDirs, or session/always approval.";
}

export function formatEgressAudit(audit: EgressAudit): string {
    const target = audit.target ? ` target=${JSON.stringify(audit.target)}` : "";
    return `[egress] AUDIT rule=${audit.rule}${target} would_block=${audit.wouldBlock} reason=${audit.reason}`;
}
