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
export function buildProjection(facts, metaOverride) {
    const detected = sessionMetaFromFacts(facts);
    const meta = {
        cwd: metaOverride?.cwd || detected.cwd || process.cwd(),
        providerId: metaOverride?.providerId || detected.providerId,
        model: metaOverride?.model || detected.model,
    };
    const messages = clampMessages(applySummary(factsToMessages(facts), facts));
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
export function readProjection(file) {
    try {
        const raw = JSON.parse(readFileSync(projectionPath(file), "utf8"));
        if (!raw || raw.version !== 1 || !Array.isArray(raw.messages) || !raw.fingerprint)
            return undefined;
        return raw;
    }
    catch {
        return undefined;
    }
}
export function writeProjection(file, projection) {
    const target = projectionPath(file);
    const tmp = target + "." + process.pid + ".tmp";
    try {
        writeFileSync(tmp, JSON.stringify(projection, null, 2), "utf8");
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
    const detected = sessionMetaFromFacts(facts);
    const meta = {
        cwd: detected.cwd || currentCwd,
        providerId: detected.providerId,
        model: detected.model,
    };
    const expected = projectionFingerprint(meta, compactionSourceFromFacts(facts));
    const stored = readProjection(file);
    const warnings = [];
    let projection;
    let rebuilt = false;
    if (stored && sameFingerprint(stored.fingerprint, expected)) {
        projection = stored;
    }
    else {
        projection = buildProjection(facts, meta);
        rebuilt = true;
        if (stored)
            warnings.push("Projection fingerprint changed (tools/model/cwd); rebuilt from facts.");
        else
            warnings.push("No projection found; rebuilt from facts.");
        try {
            writeProjection(file, projection);
        }
        catch {
            warnings.push("Could not write the projection (filesystem is read-only?); using the in-memory rebuild.");
        }
    }
    if (detected.cwd && detected.cwd !== currentCwd)
        warnings.push(`Session was recorded in ${detected.cwd}; current directory is ${currentCwd}.`);
    return { projection, messages: projection.messages, meta, warnings, rebuilt };
}
