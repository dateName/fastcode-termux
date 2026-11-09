import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { ChatMessage } from "../types.js";
import { formatToolResults } from "../agent/protocol.js";
import { toolCatalogHash } from "../agent/registry.js";
import { projectionPath, readSession, type ActiveFile } from "./log.js";

export interface SessionMeta {
    cwd: string;
    providerId: string;
    model: string;
}

export interface ProjectionFingerprint {
    toolCatalogHash: string;
    modelId: string;
    cwdDigest: string;
    compactionSource: "local" | "server" | "none";
}

export interface ProjectionManifest {
    version: 1;
    algorithm: "sha256";
    savedAt: string;
    /** Hash of the projection content (messages/meta/files). */
    contentHash: string;
    /** Hash of the source JSONL facts at save time, when available. */
    sessionHash?: string;
    /** Highest fact sequence covered by this projection. */
    lastFactSeq?: number;
}

export interface Projection {
    version: 1;
    kind: "projection";
    cwd: string;
    providerId: string;
    model: string;
    fingerprint: ProjectionFingerprint;
    messages: ChatMessage[];
    activeFiles: ActiveFile[];
    lastFactSeq: number;
    /** Integrity data written at save/prune time; never re-derived from facts. */
    manifest?: ProjectionManifest;
}

export type ProjectionReadStatus = "ok" | "legacy" | "hash_mismatch" | "corrupt" | "missing";

export interface ProjectionReadResult {
    status: ProjectionReadStatus;
    projection?: Projection;
    expectedHash?: string;
    actualHash?: string;
}

export interface ResumeState {
    projection: Projection;
    messages: ChatMessage[];
    meta: SessionMeta;
    warnings: string[];
    rebuilt: boolean;
}

const READ_ONLY_TOOLS = new Set(["read_file", "read_many", "grep", "list_files", "stat_path", "pwd"]);
const IDEMPOTENT_TOOLS = new Set(["write_file"]);
const MAX_MESSAGE_CHARS = 8_000;
const MAX_PROJECTION_BYTES = 200_000;
const TOOL_FOLD_CHARS = 600;

export function unpairedToolNotice(tool: string): string {
    if (READ_ONLY_TOOLS.has(tool))
        return "执行中断（只读工具，可安全重试）。";
    if (IDEMPOTENT_TOOLS.has(tool))
        return "执行中断，可安全重试（write_file 为全量写）。";
    return "执行状态未知：进程中断时命令可能已完成。请先验证再操作（stat / git status / git diff），不要直接重做。";
}

export function cwdDigest(cwd: string): string {
    return createHash("sha1").update(cwd).digest("hex").slice(0, 8);
}

export function projectionFingerprint(meta: SessionMeta, compactionSource: ProjectionFingerprint["compactionSource"] = "none"): ProjectionFingerprint {
    return {
        toolCatalogHash: toolCatalogHash(),
        modelId: `${meta.providerId}::${meta.model}`,
        cwdDigest: cwdDigest(meta.cwd),
        compactionSource,
    };
}

export function sameFingerprint(a: ProjectionFingerprint | undefined, b: ProjectionFingerprint): boolean {
    return Boolean(a) && a!.toolCatalogHash === b.toolCatalogHash && a!.modelId === b.modelId &&
        a!.cwdDigest === b.cwdDigest && a!.compactionSource === b.compactionSource;
}

export function sessionMetaFromFacts(facts: any[]): SessionMeta {
    let cwd = "";
    let providerId = "";
    let model = "";
    let sawStart = false;
    for (const fact of facts) {
        // Only the first session_start defines the session. A resume appends
        // another session_start with the current cwd/model, which must not
        // change the fingerprint of the stored projection.
        if (fact?.type === "session_start" && !sawStart) {
            sawStart = true;
            if (typeof fact.cwd === "string" && fact.cwd)
                cwd = fact.cwd;
            if (typeof fact.providerId === "string" && fact.providerId)
                providerId = fact.providerId;
            if (typeof fact.model === "string" && fact.model)
                model = fact.model;
        }
        else if (fact?.type === "checkpoint") {
            if (typeof fact.cwd === "string" && fact.cwd)
                cwd = fact.cwd;
            if (typeof fact.providerId === "string" && fact.providerId)
                providerId = fact.providerId;
            if (typeof fact.model === "string" && fact.model)
                model = fact.model;
        }
    }
    return { cwd, providerId, model };
}

function factsAfterClear(facts: any[]): any[] {
    for (let index = facts.length - 1; index >= 0; index -= 1) {
        if (facts[index]?.type === "cleared")
            return facts.slice(index + 1);
    }
    return facts;
}

export function sessionMetaFromFile(file: string): SessionMeta {
    return sessionMetaFromFacts(readSession(file));
}

function legacyMessages(facts: any[]): ChatMessage[] {
    return facts
        .filter((fact) => fact?.type === "message" && typeof fact.content === "string")
        .map((fact) => ({ role: fact.role, content: fact.content }));
}

export function factsToMessages(facts: any[]): ChatMessage[] {
    const calls = new Map<string, any>();
    const pending: Array<{ call: any; ok: boolean; output: string }> = [];
    const messages: ChatMessage[] = [];
    let nativeTurn = false;
    const flush = () => {
        for (const [id, call] of calls) {
            const output = unpairedToolNotice(String(call?.tool ?? "unknown"));
            if (nativeTurn)
                messages.push({ role: "tool", toolCallId: id, content: output });
            else
                pending.push({ call, ok: false, output });
        }
        calls.clear();
        if (pending.length > 0)
            messages.push({ role: "user", content: formatToolResults(pending.splice(0)) });
    };
    for (const fact of facts) {
        if (!fact)
            continue;
        if (fact.type === "user") {
            flush();
            nativeTurn = false;
            if (typeof fact.content === "string" && fact.content)
                messages.push({ role: "user", content: fact.content });
        }
        else if (fact.type === "assistant_raw") {
            flush();
            const nativeCalls = Array.isArray(fact.toolCalls) ? fact.toolCalls : undefined;
            nativeTurn = Boolean(nativeCalls && nativeCalls.length > 0);
            if (typeof fact.content === "string")
                messages.push({ role: "assistant", content: fact.content, ...(nativeTurn ? { toolCalls: nativeCalls } : {}) });
        }
        else if (fact.type === "tool_call") {
            calls.set(String(fact.id ?? ""), fact.args ?? { tool: fact.tool });
        }
        else if (fact.type === "notice") {
            if (typeof fact.content === "string" && fact.content)
                messages.push({ role: "system", content: fact.content });
        }
        else if (fact.type === "tool_result") {
            const id = String(fact.id ?? "");
            const call = calls.get(id) ?? { tool: fact.tool ?? "unknown" };
            calls.delete(id);
            if (nativeTurn) {
                messages.push({ role: "tool", toolCallId: id, content: String(fact.output ?? "") });
            }
            else {
                pending.push({
                    call,
                    ok: Boolean(fact.ok),
                    output: String(fact.output ?? ""),
                });
            }
        }
        else if (fact.type === "egress_denied") {
            const target = fact.target ? ` target=${JSON.stringify(fact.target)}` : "";
            const content = `[egress] ${fact.mode ?? "audit"} rule=${fact.rule ?? "unknown"}${target} would_block=${Boolean(fact.wouldBlock)}\n${fact.reason ?? ""}`;
            messages.push({ role: "system", content });
        }
    }
    flush();
    if (messages.length === 0)
        return legacyMessages(facts);
    return messages;
}

export function compactionSourceFromFacts(facts: any[]): ProjectionFingerprint["compactionSource"] {
    let source: ProjectionFingerprint["compactionSource"] = "none";
    for (const fact of facts) {
        if (fact?.type === "compacted" && (fact.source === "local" || fact.source === "server"))
            source = fact.source;
    }
    return source;
}

function latestCompaction(facts: any[]): any | undefined {
    for (let i = facts.length - 1; i >= 0; i -= 1) {
        if (facts[i]?.type === "compacted")
            return facts[i];
    }
    return undefined;
}

function applySummary(messages: ChatMessage[], facts: any[]): ChatMessage[] {
    const latest = latestCompaction(facts);
    if (!latest || latest.source !== "local" || typeof latest.summaryRef !== "string")
        return messages;
    try {
        const summary = readFileSync(latest.summaryRef, "utf8");
        const keep = Number(latest.keepMessages);
        const tail = Number.isFinite(keep) && keep > 0 ? messages.slice(-keep) : messages;
        const first = messages[0]?.role === "user" ? messages[0] : undefined;
        const marker: ChatMessage = { role: "system", content: `[context summary]\n${summary}` };
        if (first && tail[0] !== first)
            return [first, marker, ...tail];
        return [marker, ...tail];
    }
    catch {
        return [
            ...messages,
            { role: "system", content: "[projection] Summary file could not be read; resumed without the summary marker." },
        ];
    }
}

export function projectionContentHash(projection: Projection): string {
    const core = {
        version: projection.version,
        kind: projection.kind,
        cwd: projection.cwd,
        providerId: projection.providerId,
        model: projection.model,
        fingerprint: projection.fingerprint,
        messages: projection.messages,
        activeFiles: projection.activeFiles,
        lastFactSeq: projection.lastFactSeq,
    };
    return createHash("sha256").update(JSON.stringify(core)).digest("hex");
}

export function factsContentHash(facts: any[]): string {
    return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

function lastFactSeqOf(facts: any[]): number {
    let seq = 0;
    for (const fact of facts) {
        if (typeof fact?.seq === "number" && fact.seq > seq)
            seq = fact.seq;
    }
    return seq;
}

function withManifest(projection: Projection, facts?: any[]): Projection {
    return {
        ...projection,
        manifest: {
            version: 1,
            algorithm: "sha256",
            savedAt: new Date().toISOString(),
            contentHash: projectionContentHash(projection),
            ...(facts ? { sessionHash: factsContentHash(facts), lastFactSeq: lastFactSeqOf(facts) } : {}),
        },
    };
}

function emptyProjection(meta: SessionMeta): Projection {
    return buildProjection([], meta);
}

/**
 * Keep native tool_call/tool_result pairs complete. Orphan tool messages left
 * behind by projection truncation are dropped; missing results are synthesized
 * with the existing "execution unknown" notice so a resumed model never waits
 * for a result that cannot arrive.
 */
export function pairToolMessages(messages: ChatMessage[]): { messages: ChatMessage[]; repaired: boolean } {
    const out: ChatMessage[] = [];
    const expected = new Map<string, string>();
    let repaired = false;
    const synthesize = () => {
        for (const [id, tool] of expected)
            out.push({ role: "tool", toolCallId: id, content: unpairedToolNotice(tool) });
        if (expected.size > 0)
            repaired = true;
        expected.clear();
    };
    for (const message of messages) {
        if (message.role === "tool") {
            if (!message.toolCallId || !expected.has(message.toolCallId)) {
                repaired = true;
                continue;
            }
            expected.delete(message.toolCallId);
            out.push(message);
            continue;
        }
        synthesize();
        out.push(message);
        if (message.role === "assistant" && Array.isArray(message.toolCalls)) {
            for (const call of message.toolCalls) {
                if (call?.id)
                    expected.set(String(call.id), String(call.name ?? "unknown"));
            }
        }
    }
    synthesize();
    return { messages: out, repaired };
}

export function buildProjection(facts: any[], metaOverride?: Partial<SessionMeta>): Projection {
    const detected = sessionMetaFromFacts(facts);
    const meta: SessionMeta = {
        cwd: metaOverride?.cwd || detected.cwd || process.cwd(),
        providerId: metaOverride?.providerId || detected.providerId,
        model: metaOverride?.model || detected.model,
    };
    const threadFacts = factsAfterClear(facts);
    const folded = foldToolMessages(applySummary(factsToMessages(threadFacts), threadFacts));
    const messages = pairToolMessages(clampMessages(folded)).messages;
    const source = compactionSourceFromFacts(threadFacts);
    let activeFiles: ActiveFile[] = [];
    let lastFactSeq = 0;
    for (const fact of facts) {
        if (typeof fact?.seq === "number" && fact.seq > lastFactSeq)
            lastFactSeq = fact.seq;
    }
    for (const fact of threadFacts) {
        if (fact?.type === "checkpoint" && Array.isArray(fact.activeFiles))
            activeFiles = fact.activeFiles;
    }
    const projection: Projection = {
        version: 1,
        kind: "projection",
        cwd: meta.cwd,
        providerId: meta.providerId,
        model: meta.model,
        fingerprint: projectionFingerprint(meta, source),
        messages,
        activeFiles: activeFiles.slice(0, 200),
        lastFactSeq,
    };
    return projection;
}

function clipProjection(text: string, max: number): string {
    const oneLine = String(text).replace(/\s+/g, " ").trim();
    return oneLine.length > max ? oneLine.slice(0, Math.max(1, max - 1)) + "…" : oneLine;
}

function toolTarget(args: any): string {
    if (!args || typeof args !== "object")
        return "";
    const value = args.path ?? args.from ?? args.to ?? args.command ?? args.pattern;
    return typeof value === "string" ? clipProjection(value, 160) : "";
}

function firstImportantLine(text: string): string {
    const lines = String(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^```/.test(line) && line !== "output:");
    const important = lines.find((line) => /error|failed|not found|denied|timed out|exit/i.test(line)) ?? lines[0] ?? "";
    return clipProjection(important, 200);
}

/** Keep the edit fact (tool + target + outcome), not the full tool payload. */
function foldToolMessages(messages: ChatMessage[]): ChatMessage[] {
    const calls = new Map<string, { name: string; args: any }>();
    const out: ChatMessage[] = [];
    for (const message of messages) {
        if (message.role === "assistant" && Array.isArray(message.toolCalls)) {
            for (const call of message.toolCalls) {
                let args: any = {};
                try {
                    args = JSON.parse(call.arguments || "{}");
                }
                catch {
                    args = {};
                }
                calls.set(String(call.id), { name: String(call.name ?? "tool"), args });
            }
            out.push(message);
            continue;
        }
        if (message.role === "tool") {
            const call = message.toolCallId ? calls.get(String(message.toolCallId)) : undefined;
            const target = toolTarget(call?.args);
            const status = /error|failed|not found|denied|timed out/i.test(message.content) ? "error" : "ok";
            const detail = firstImportantLine(message.content);
            out.push({
                ...message,
                content: clipProjection(`${call?.name ?? "tool"}${target ? ` ${target}` : ""} → ${status}${detail ? `: ${detail}` : ""}`, TOOL_FOLD_CHARS),
            });
            continue;
        }
        if (message.role === "user" && message.content.startsWith("FastCode executed the requested local tools.")) {
            out.push({ ...message, content: foldLegacyToolResults(message.content) });
            continue;
        }
        out.push(message);
    }
    return out;
}

function foldLegacyToolResults(content: string): string {
    const header = "FastCode executed the requested local tools.";
    const body = content.slice(content.indexOf(header) + header.length).trim();
    const blocks = body.split(/\n\n(?=Tool result \d+ \()/);
    const folded: string[] = [header];
    for (const block of blocks) {
        const statusMatch = block.match(/^Tool result \d+ \((ok|error)\)/);
        if (!statusMatch)
            continue;
        const callMatch = block.match(/^call:\s*(\{.*\})$/m);
        let call: any = {};
        try {
            call = callMatch ? JSON.parse(callMatch[1]) : {};
        }
        catch {
            call = {};
        }
        const output = block.includes("output:") ? block.slice(block.indexOf("output:") + "output:".length) : block;
        const target = toolTarget(call);
        const detail = firstImportantLine(output);
        folded.push(`- ${String(call.tool ?? "tool")}${target ? ` ${target}` : ""} → ${statusMatch[1]}${detail ? `: ${detail}` : ""}`);
    }
    return folded.length > 1 ? folded.join("\n") : clipProjection(content, TOOL_FOLD_CHARS);
}

function truncateMessageContent(content: string): string {
    if (content.length <= MAX_MESSAGE_CHARS)
        return content;
    const head = Math.floor(MAX_MESSAGE_CHARS * 0.6);
    const tail = Math.max(0, MAX_MESSAGE_CHARS - head);
    return `${content.slice(0, head)}\n[...truncated in projection...]\n${content.slice(-tail)}`;
}

function protectedMessage(message: ChatMessage): boolean {
    return message.role === "system" && /^\[(context summary|context compacted|projection)/.test(message.content);
}

function clampMessages(messages: ChatMessage[]): ChatMessage[] {
    const list = messages.map((message) => ({
        role: message.role,
        content: truncateMessageContent(message.content),
        ...(message.toolCalls ? { toolCalls: message.toolCalls } : {}),
        ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    }));
    let dropped = 0;
    const overBudget = () => list.length > 1 && Buffer.byteLength(JSON.stringify(list), "utf8") > MAX_PROJECTION_BYTES;
    const dropOldest = (marker?: ChatMessage): boolean => {
        for (let index = 0; index < list.length; index += 1) {
            const message = list[index];
            if (index === 0 && message.role === "user")
                continue;
            if (message === marker || protectedMessage(message))
                continue;
            list.splice(index, 1);
            dropped += 1;
            return true;
        }
        return false;
    };
    while (overBudget() && dropOldest())
        ;
    if (dropped > 0) {
        const marker: ChatMessage = {
            role: "system",
            content: `[projection] ${dropped} earlier message(s) dropped to fit ${MAX_PROJECTION_BYTES} bytes.`,
        };
        const insertAt = list[0]?.role === "user" ? 1 : 0;
        list.splice(insertAt, 0, marker);
        while (overBudget() && dropOldest(marker)) {
            marker.content = `[projection] ${dropped} earlier message(s) dropped to fit ${MAX_PROJECTION_BYTES} bytes.`;
        }
    }
    return list;
}

export function readProjectionResult(file: string): ProjectionReadResult {
    let raw: any;
    try {
        raw = JSON.parse(readFileSync(projectionPath(file), "utf8"));
    }
    catch (err: any) {
        if (err?.code === "ENOENT")
            return { status: "missing" };
        return { status: "corrupt" };
    }
    if (!raw || raw.version !== 1 || !Array.isArray(raw.messages) || !raw.fingerprint)
        return { status: "corrupt" };
    const projection = raw as Projection;
    if (!raw.manifest || typeof raw.manifest.contentHash !== "string")
        return { status: "legacy", projection };
    const actualHash = projectionContentHash(projection);
    if (actualHash !== raw.manifest.contentHash)
        return { status: "hash_mismatch", projection, expectedHash: raw.manifest.contentHash, actualHash };
    return { status: "ok", projection, expectedHash: raw.manifest.contentHash, actualHash };
}

export function readProjection(file: string): Projection | undefined {
    const result = readProjectionResult(file);
    return result.status === "ok" || result.status === "legacy" ? result.projection : undefined;
}

export function writeProjection(file: string, projection: Projection, facts?: any[]): void {
    const target = projectionPath(file);
    const tmp = target + "." + process.pid + ".tmp";
    try {
        writeFileSync(tmp, JSON.stringify(withManifest(projection, facts), null, 2), "utf8");
        renameSync(tmp, target);
    }
    catch (err) {
        try {
            rmSync(tmp, { force: true });
        }
        catch {
            // best effort
        }
        throw err;
    }
}

export function resumeSession(file: string, currentCwd = process.cwd()): ResumeState {
    const facts = readSession(file);
    const hasFacts = facts.length > 0;
    const detected = sessionMetaFromFacts(facts);
    const read = readProjectionResult(file);
    const stored = read.projection;
    const meta: SessionMeta = {
        cwd: detected.cwd || stored?.cwd || currentCwd,
        providerId: detected.providerId || stored?.providerId || "",
        model: detected.model || stored?.model || "",
    };
    const expected = projectionFingerprint(
        meta,
        hasFacts ? compactionSourceFromFacts(factsAfterClear(facts)) : (stored?.fingerprint.compactionSource ?? "none"),
    );
    const warnings: string[] = [];
    let projection: Projection | undefined;
    let rebuilt = false;
    const currentSessionHash = hasFacts ? factsContentHash(facts) : undefined;
    const sessionChanged = hasFacts && Boolean(stored?.manifest?.sessionHash) &&
        stored!.manifest!.sessionHash !== currentSessionHash;
    const coveredSeq = stored?.manifest?.lastFactSeq ?? stored?.lastFactSeq ?? 0;
    const factsNotCovered = hasFacts && coveredSeq < lastFactSeqOf(facts);

    if (stored && (read.status === "ok" || read.status === "legacy") &&
        sameFingerprint(stored.fingerprint, expected) && !sessionChanged && !factsNotCovered) {
        projection = stored;
        if (read.status === "legacy")
            warnings.push("Projection has no manifest; integrity could not be verified.");
    }
    else {
        if (read.status === "hash_mismatch")
            warnings.push("Projection manifest hash does not match its contents; ignoring the stored copy.");
        else if (read.status === "corrupt")
            warnings.push("Projection file is corrupt; rebuilding from session facts.");
        else if (sessionChanged || factsNotCovered)
            warnings.push("Session facts changed since the projection was saved; rebuilt from facts.");
        else if (stored)
            warnings.push("Projection fingerprint changed (tools/model/cwd); rebuilt from facts.");

        if (hasFacts) {
            projection = buildProjection(facts, meta);
            rebuilt = true;
            if (!stored)
                warnings.push("No projection found; rebuilt from facts.");
            try {
                writeProjection(file, projection, facts);
            }
            catch {
                warnings.push("Could not write the projection (filesystem is read-only?); using the in-memory rebuild.");
            }
        }
        else if (stored && read.status !== "hash_mismatch" && read.status !== "corrupt") {
            // The original JSONL was pruned. The verified projection is the
            // only remaining evidence, so use it rather than re-deriving trust
            // from facts that no longer exist.
            projection = stored;
            warnings.push("Session facts were pruned; using the stored projection.");
        }
        else {
            projection = emptyProjection(meta);
            warnings.push("Session content is unavailable or unverifiable; resumed history is empty.");
        }
    }

    const repaired = pairToolMessages(projection.messages);
    if (repaired.repaired)
        warnings.push("Tool call/result pairing was repaired during resume.");
    const finalProjection: Projection = { ...projection, messages: repaired.messages };
    if (detected.cwd && detected.cwd !== currentCwd)
        warnings.push(`Session was recorded in ${detected.cwd}; current directory is ${currentCwd}.`);
    return { projection: finalProjection, messages: finalProjection.messages, meta, warnings, rebuilt };
}
