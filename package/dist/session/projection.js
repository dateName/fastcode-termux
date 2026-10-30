import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { formatToolResults } from "../agent/protocol.js";
import { toolCatalogHash } from "../agent/registry.js";
import { projectionPath, readSession } from "./log.js";
const READ_ONLY_TOOLS = new Set(["read_file", "read_many", "grep", "list_files", "stat_path", "pwd"]);
const IDEMPOTENT_TOOLS = new Set(["write_file"]);
const MAX_MESSAGE_CHARS = 4000;
const MAX_PROJECTION_BYTES = 19_000;
export function unpairedToolNotice(tool) {
    if (READ_ONLY_TOOLS.has(tool))
        return "执行中断（只读工具，可安全重试）。";
    if (IDEMPOTENT_TOOLS.has(tool))
        return "执行中断，可安全重试（write_file 为全量写）。";
    return "执行状态未知：进程中断时命令可能已完成。请先验证再操作（stat / git status / git diff），不要直接重做。";
}
export function cwdDigest(cwd) {
    return createHash("sha1").update(cwd).digest("hex").slice(0, 8);
}
export function projectionFingerprint(meta, compactionSource = "none") {
    return {
        toolCatalogHash: toolCatalogHash(),
        modelId: `${meta.providerId}::${meta.model}`,
        cwdDigest: cwdDigest(meta.cwd),
        compactionSource,
    };
}
export function sameFingerprint(a, b) {
    return Boolean(a) && a.toolCatalogHash === b.toolCatalogHash && a.modelId === b.modelId &&
        a.cwdDigest === b.cwdDigest && a.compactionSource === b.compactionSource;
}
export function sessionMetaFromFacts(facts) {
    let cwd = "";
    let providerId = "";
    let model = "";
    for (const fact of facts) {
        if (fact?.type === "session_start" || fact?.type === "checkpoint") {
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
export function sessionMetaFromFile(file) {
    return sessionMetaFromFacts(readSession(file));
}
function legacyMessages(facts) {
    return facts
        .filter((fact) => fact?.type === "message" && typeof fact.content === "string")
        .map((fact) => ({ role: fact.role, content: fact.content }));
}
export function factsToMessages(facts) {
    const calls = new Map();
    const pending = [];
    const messages = [];
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
    }
    flush();
    if (messages.length === 0)
        return legacyMessages(facts);
    return messages;
}
export function compactionSourceFromFacts(facts) {
    let source = "none";
    for (const fact of facts) {
        if (fact?.type === "compacted" && (fact.source === "local" || fact.source === "server"))
            source = fact.source;
    }
    return source;
}
function latestCompaction(facts) {
    for (let i = facts.length - 1; i >= 0; i -= 1) {
        if (facts[i]?.type === "compacted")
            return facts[i];
    }
    return undefined;
}
function applySummary(messages, facts) {
    const latest = latestCompaction(facts);
    if (!latest || latest.source !== "local" || typeof latest.summaryRef !== "string")
        return messages;
    try {
        const summary = readFileSync(latest.summaryRef, "utf8");
        const keep = Number(latest.keepMessages);
        const tail = Number.isFinite(keep) && keep > 0 ? messages.slice(-keep) : messages;
        const first = messages[0]?.role === "user" ? messages[0] : undefined;
        const marker = { role: "system", content: `[context summary]\n${summary}` };
        if (first && tail[0] !== first)
            return [first, marker, ...tail];
        return [marker, ...tail];
    }
    catch {
        return messages;
    }
}
export function projectionContentHash(projection) {
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
export function factsContentHash(facts) {
    return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}
function lastFactSeqOf(facts) {
    let seq = 0;
    for (const fact of facts) {
        if (typeof fact?.seq === "number" && fact.seq > seq)
            seq = fact.seq;
    }
    return seq;
}
function withManifest(projection, facts) {
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
function emptyProjection(meta) {
    return buildProjection([], meta);
}
/**
 * Keep native tool_call/tool_result pairs complete. Orphan tool messages left
 * behind by projection truncation are dropped; missing results are synthesized
 * with the existing "execution unknown" notice so a resumed model never waits
 * for a result that cannot arrive.
 */
export function pairToolMessages(messages) {
    const out = [];
    const expected = new Map();
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
export function buildProjection(facts, metaOverride) {
    const detected = sessionMetaFromFacts(facts);
    const meta = {
        cwd: metaOverride?.cwd || detected.cwd || process.cwd(),
        providerId: metaOverride?.providerId || detected.providerId,
        model: metaOverride?.model || detected.model,
    };
    const messages = pairToolMessages(clampMessages(applySummary(factsToMessages(facts), facts))).messages;
    const source = compactionSourceFromFacts(facts);
    let activeFiles = [];
    let lastFactSeq = 0;
    for (const fact of facts) {
        if (typeof fact?.seq === "number" && fact.seq > lastFactSeq)
            lastFactSeq = fact.seq;
        if (fact?.type === "checkpoint" && Array.isArray(fact.activeFiles))
            activeFiles = fact.activeFiles;
    }
    const projection = {
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
function clampMessages(messages) {
    const list = messages.map((message) => {
        const content = message.content.length > MAX_MESSAGE_CHARS
            ? message.content.slice(0, MAX_MESSAGE_CHARS) + "\n[...truncated in projection...]"
            : message.content;
        return {
            role: message.role,
            content,
            ...(message.toolCalls ? { toolCalls: message.toolCalls } : {}),
            ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
        };
    });
    while (list.length > 1 && Buffer.byteLength(JSON.stringify(list), "utf8") > MAX_PROJECTION_BYTES) {
        if (list.length > 2 && list[0].role === "user")
            list.splice(1, 1);
        else
            list.shift();
    }
    return list;
}
export function readProjectionResult(file) {
    let raw;
    try {
        raw = JSON.parse(readFileSync(projectionPath(file), "utf8"));
    }
    catch (err) {
        if (err?.code === "ENOENT")
            return { status: "missing" };
        return { status: "corrupt" };
    }
    if (!raw || raw.version !== 1 || !Array.isArray(raw.messages) || !raw.fingerprint)
        return { status: "corrupt" };
    const projection = raw;
    if (!raw.manifest || typeof raw.manifest.contentHash !== "string")
        return { status: "legacy", projection };
    const actualHash = projectionContentHash(projection);
    if (actualHash !== raw.manifest.contentHash)
        return { status: "hash_mismatch", projection, expectedHash: raw.manifest.contentHash, actualHash };
    return { status: "ok", projection, expectedHash: raw.manifest.contentHash, actualHash };
}
export function readProjection(file) {
    const result = readProjectionResult(file);
    return result.status === "ok" || result.status === "legacy" ? result.projection : undefined;
}
export function writeProjection(file, projection, facts) {
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
export function resumeSession(file, currentCwd = process.cwd()) {
    const facts = readSession(file);
    const hasFacts = facts.length > 0;
    const detected = sessionMetaFromFacts(facts);
    const read = readProjectionResult(file);
    const stored = read.projection;
    const meta = {
        cwd: detected.cwd || stored?.cwd || currentCwd,
        providerId: detected.providerId || stored?.providerId || "",
        model: detected.model || stored?.model || "",
    };
    const expected = projectionFingerprint(meta, hasFacts ? compactionSourceFromFacts(facts) : (stored?.fingerprint.compactionSource ?? "none"));
    const warnings = [];
    let projection;
    let rebuilt = false;
    const currentSessionHash = hasFacts ? factsContentHash(facts) : undefined;
    const sessionChanged = hasFacts && Boolean(stored?.manifest?.sessionHash) &&
        stored.manifest.sessionHash !== currentSessionHash;
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
    const finalProjection = { ...projection, messages: repaired.messages };
    if (detected.cwd && detected.cwd !== currentCwd)
        warnings.push(`Session was recorded in ${detected.cwd}; current directory is ${currentCwd}.`);
    return { projection: finalProjection, messages: finalProjection.messages, meta, warnings, rebuilt };
}
