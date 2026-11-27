import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { estMessagesTokens, estTokens } from "../lib/model-meta.js";
import { getPaths } from "../config/paths.js";
import type { ChatMessage } from "../types.js";
import { parseToolCalls, stripToolCalls } from "./protocol.js";

export interface CompactionConfig {
    enabled: boolean;
    localThresholdRatio: number;
    keepTurns: number;
    serverCompactionAware: boolean;
    serverCompactThreshold?: number;
    clampAboveServerByTokens: number;
    maxSummaryTokens: number;
    heapLimitMb: number;
    anchorChars: number;
    anchorCooldownTurns: number;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
    enabled: true,
    localThresholdRatio: 0.7,
    keepTurns: 6,
    serverCompactionAware: false,
    clampAboveServerByTokens: 8192,
    maxSummaryTokens: 1500,
    heapLimitMb: 220,
    anchorChars: 0,
    anchorCooldownTurns: 3,
};

export interface CompactionOptions {
    contextWindow: number;
    providerId?: string;
    model?: string;
    force?: boolean;
    forceReason?: "anchor";
    serverOpaqueState?: string;
}

export interface CompactionResult {
    messages: ChatMessage[];
    compacted: boolean;
    reason?: "threshold" | "heap" | "anchor";
    source: "local" | "server" | "none";
    beforeTokens: number;
    afterTokens: number;
    beforeChars: number;
    afterChars: number;
    droppedMessages: number;
    droppedFromSeq?: number;
    droppedToSeq?: number;
    droppedCount?: number;
    droppedSeqUnmapped?: boolean;
    keptMessages: number;
    summary?: string;
    summaryFile?: string;
}

export function compactionConfigFromEnv(): CompactionConfig {
    const config = { ...DEFAULT_COMPACTION_CONFIG };
    const disabled = (process.env["FASTCODE_COMPACTION"] ?? "").trim().toLowerCase();
    if (["0", "false", "no", "off"].includes(disabled))
        config.enabled = false;
    const heap = Number(process.env["FASTCODE_HEAP_LIMIT_MB"]);
    if (Number.isFinite(heap) && heap > 0)
        config.heapLimitMb = heap;
    const ratio = Number(process.env["FASTCODE_COMPACTION_RATIO"]);
    if (Number.isFinite(ratio) && ratio > 0 && ratio < 1)
        config.localThresholdRatio = ratio;
    const keepTurns = Number(process.env["FASTCODE_COMPACTION_KEEP_TURNS"]);
    if (Number.isFinite(keepTurns) && keepTurns > 0)
        config.keepTurns = Math.floor(keepTurns);
    const summaryTokens = Number(process.env["FASTCODE_COMPACTION_SUMMARY_TOKENS"]);
    if (Number.isFinite(summaryTokens) && summaryTokens > 0)
        config.maxSummaryTokens = Math.floor(summaryTokens);
    const anchorChars = Number(process.env["FASTCODE_ANCHOR_CHARS"]);
    if (Number.isFinite(anchorChars) && anchorChars >= 0)
        config.anchorChars = Math.floor(anchorChars);
    const anchorCooldown = Number(process.env["FASTCODE_ANCHOR_COOLDOWN_TURNS"]);
    if (Number.isFinite(anchorCooldown) && anchorCooldown >= 0)
        config.anchorCooldownTurns = Math.floor(anchorCooldown);
    const server = (process.env["FASTCODE_SERVER_COMPACTION"] ?? "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(server))
        config.serverCompactionAware = true;
    return config;
}

export function localThresholdTokens(config: CompactionConfig, contextWindow: number): number {
    const local = Math.floor(Math.max(1, contextWindow) * config.localThresholdRatio);
    if (config.serverCompactionAware && typeof config.serverCompactThreshold === "number" && config.serverCompactThreshold > 0) {
        return Math.max(local, config.serverCompactThreshold + config.clampAboveServerByTokens);
    }
    return local;
}

export function heapExceeded(config: CompactionConfig): boolean {
    const used = process.memoryUsage().heapUsed;
    return used > Math.max(0, config.heapLimitMb) * 1024 * 1024;
}

export function shouldCompact(messages: ChatMessage[], config: CompactionConfig, options: CompactionOptions): boolean {
    if (!config.enabled)
        return false;
    if (options.force || heapExceeded(config))
        return true;
    return messageTokens(messages, options) > localThresholdTokens(config, options.contextWindow);
}

export function compactMessages(messages: ChatMessage[], config: CompactionConfig = DEFAULT_COMPACTION_CONFIG, options: CompactionOptions): CompactionResult {
    const beforeTokens = messageTokens(messages, options);
    const beforeChars = messageChars(messages);
    const heap = heapExceeded(config);
    const noop: CompactionResult = {
        messages,
        compacted: false,
        source: "none",
        beforeTokens,
        afterTokens: beforeTokens,
        beforeChars,
        afterChars: beforeChars,
        droppedMessages: 0,
        keptMessages: messages.length,
    };
    if (!config.enabled)
        return noop;
    const threshold = localThresholdTokens(config, options.contextWindow);
    if (!options.force && !heap && beforeTokens <= threshold)
        return noop;
    const reason: "threshold" | "heap" | "anchor" = options.forceReason === "anchor" ? "anchor" : heap && beforeTokens <= threshold ? "heap" : "threshold";
    if (config.serverCompactionAware && options.serverOpaqueState) {
        return {
            ...noop,
            compacted: true,
            reason,
            source: "server",
        };
    }
    const headCount = messages[0]?.role === "user" ? 1 : 0;
    let keep = Math.max(2, Math.floor(config.keepTurns * 2));
    let tailStart = Math.max(headCount, messages.length - keep);
    if (tailStart <= headCount && messages.length >= headCount + 3) {
        // Short histories still need to converge: retain fewer tail messages
        // so at least one middle message can be summarized. Two messages are
        // already the minimum (head + current turn) and stay untouched.
        keep = Math.min(keep, Math.max(2, messages.length - headCount - 1));
        tailStart = Math.max(headCount + 1, messages.length - keep);
    }
    if (tailStart <= headCount)
        return noop;
    const middle = messages.slice(headCount, tailStart);
    const middleSeqs = middle.map((message) => message.seq).filter((seq): seq is number => typeof seq === "number" && Number.isFinite(seq));
    const summary = buildSummary(middle, config, options);
    const summaryFile = writeSummaryFile(summary);
    const marker: ChatMessage = {
        role: "system",
        content: `[context compacted: ${middle.length} earlier messages were summarized to stay within the context window.` +
            `${summaryFile ? ` Summary file: ${summaryFile}.` : ""} Recent turns are kept verbatim.` +
            " If an earlier detail is missing, re-read that file with a tool.]\n\n" +
            summary,
    };
    let next = [...messages.slice(0, headCount), marker, ...messages.slice(tailStart)];
    let afterTokens = messageTokens(next, options);
    // If summarization barely helped (the oversized message is in the verbatim
    // tail), slim the offenders in place. Without this the same blob makes the
    // next turn cross the threshold again, forever.
    if (afterTokens > beforeTokens * NO_PROGRESS_RATIO) {
        next = next.map((message) => {
            const content = message.content ?? "";
            if ((message.role === "tool" || message.role === "user") && content.length > NO_PROGRESS_SLIM_THRESHOLD) {
                return {
                    ...message,
                    content: content.slice(0, NO_PROGRESS_SLIM_KEEP) +
                        `\n[... ${content.length - NO_PROGRESS_SLIM_KEEP} chars elided by compaction ...]`,
                };
            }
            return message;
        });
        afterTokens = messageTokens(next, options);
    }
    return {
        messages: next,
        compacted: true,
        reason,
        source: "local",
        beforeTokens,
        afterTokens,
        beforeChars,
        afterChars: messageChars(next),
        droppedMessages: middle.length,
        ...(middleSeqs.length > 0 ? { droppedFromSeq: Math.min(...middleSeqs), droppedToSeq: Math.max(...middleSeqs) } : {}),
        droppedCount: middle.length,
        ...(middleSeqs.length !== middle.length ? { droppedSeqUnmapped: true } : {}),
        keptMessages: next.length - headCount - 1,
        summary,
        summaryFile,
    };
}

/** CompactMessages returns the same turn again if it recovers less than this. */
const NO_PROGRESS_RATIO = 0.9;
const NO_PROGRESS_SLIM_THRESHOLD = 20_000;
const NO_PROGRESS_SLIM_KEEP = 8_000;
/** Only scan the head of a message when building the summary. */
const SUMMARY_SCAN_LIMIT = 256 * 1024;

function messageTokens(messages: ChatMessage[], options: CompactionOptions): number {
    return estMessagesTokens(messages, { providerId: options.providerId, model: options.model });
}

function messageChars(messages: ChatMessage[]): number {
    return messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
}

export function buildSummary(messages: ChatMessage[], config: CompactionConfig, options: Pick<CompactionOptions, "providerId" | "model">): string {
    const requests: string[] = [];
    const actions: string[] = [];
    const outcomes: string[] = [];
    const notes: string[] = [];
    const files = new Set<string>();
    for (const message of messages) {
        if (!message.content)
            continue;
        const content = message.content.length > SUMMARY_SCAN_LIMIT
            ? message.content.slice(0, SUMMARY_SCAN_LIMIT)
            : message.content;
        const seq = message.seq ? `[seq=${message.seq}] ` : "";
        if (message.role === "user") {
            if (content.startsWith("FastCode executed the requested local tools.")) {
                for (const line of content.split(/\r?\n/)) {
                    if (/error|failed|not found|denied|timed out/i.test(line))
                        outcomes.push(clip(`${seq}${line}`, 240));
                }
            }
            else {
                requests.push(clip(`${seq}${content}`, 300));
            }
            collectFiles(content, files);
            continue;
        }
        if (message.role === "assistant") {
            const calls = parseToolCalls(content).calls;
            for (const call of calls)
                actions.push(clip(`${seq}${describeCall(call)}`, 300));
            const visible = stripToolCalls(content);
            if (visible)
                notes.push(clip(`${seq}${visible}`, 300));
            collectFiles(content, files);
            continue;
        }
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            if (/error|failed|not found|denied|timed out/i.test(line))
                outcomes.push(clip(`${seq}${line}`, 240));
        }
        collectFiles(content, files);
    }
    const fileList = Array.from(files);
    const sections = [
        "# Session summary",
        "",
        // Conclusions first: when the token budget runs out, keep what the
        // session decided rather than the oldest requests.
        "## Notes",
        ...limitLines(notes, 10, "notes").map((line) => `- ${line}`),
        "",
        "## Outcomes",
        ...limitLines(outcomes, 10, "outcomes").map((line) => `- ${line}`),
        "",
        "## Files touched",
        ...(fileList.length > 0
            ? [
                ...fileList.slice(0, 40).map((file) => `- ${file}`),
                ...(fileList.length > 40 ? [`- (${fileList.length - 40} more files not listed)`] : []),
            ]
            : ["- (none recorded)"]),
        "",
        "## Requests",
        ...limitLines(requests, 20, "requests").map((line) => `- ${line}`),
        "",
        "## Actions",
        ...limitLines(actions, 20, "actions").map((line) => `- ${line}`),
    ];
    const budget = Math.max(200, Math.floor(config.maxSummaryTokens));
    const kept: string[] = [];
    let used = 0;
    for (const line of sections) {
        const cost = estTokens(line + "\n", options);
        if (used + cost > budget) {
            kept.push("[... summary truncated ...]");
            break;
        }
        kept.push(line);
        used += cost;
    }
    return kept.join("\n").trimEnd() + "\n";
}

function describeCall(call: any): string {
    const tool = String(call?.tool ?? "unknown");
    if (tool === "shell" && typeof call.command === "string")
        return `shell: ${clip(call.command, 200)}`;
    if (typeof call.path === "string")
        return `${tool}: ${call.path}`;
    if (typeof call.from === "string" || typeof call.to === "string")
        return `${tool}: ${call.from ?? "?"} -> ${call.to ?? "?"}`;
    if (typeof call.pattern === "string")
        return `${tool}: /${clip(call.pattern, 120)}/`;
    return tool;
}

function collectFiles(text: string, files: Set<string>): void {
    // The character class is bounded so the engine cannot backtrack from every
    // start position to the end of an enormous line (the 1.2MB O(n²) hang).
    // It also stays aligned with looksLikeProjectFile's 240-char rejection.
    const sample = text.length > COLLECT_FILES_SAMPLE_BYTES
        ? text.slice(0, COLLECT_FILES_SAMPLE_BYTES)
        : text;
    const matches = sample.match(/[A-Za-z0-9_@./\\-]{1,240}\.[A-Za-z0-9]{1,8}\b/g);
    if (!matches)
        return;
    for (const match of matches) {
        if (!looksLikeProjectFile(match))
            continue;
        files.add(match);
        if (files.size >= 200)
            return;
    }
}

/** File names are a summary hint, not a full transcript scan. */
const COLLECT_FILES_SAMPLE_BYTES = 64 * 1024;

function looksLikeProjectFile(value: string): boolean {
    if (value.length <= 3 || value.length > 240)
        return false;
    if (/^summary-\d/.test(value) || value.includes("//") || value.includes("\\.") || value.startsWith("s/"))
        return false;
    if (/^\d+(\.\d+)+$/.test(value))
        return false;
    return /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|py|rs|go|java|kt|kts|c|cc|cpp|h|hpp|sh|bash|zsh|fish|yml|yaml|toml|ini|conf|cfg|env|lock|sql|html|css|scss|sass|less|vue|svelte|rb|php|swift|dart|xml|gradle|properties)$/i.test(value);
}

function limitLines(lines: string[], max: number, label: string): string[] {
    if (lines.length <= max)
        return lines;
    return [...lines.slice(0, max), `(${lines.length - max} more ${label} not listed)`];
}

function clip(text: string, max: number): string {
    const input = String(text);
    // Bound the whitespace-collapse pass as well: `/\s+/g` over a multi-MB
    // string is the second hot spot in the summary path.
    const bound = Math.max(4096, max * 8);
    const bounded = input.length > bound ? input.slice(0, bound) : input;
    const oneLine = bounded.replace(/\s+/g, " ").trim();
    return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

/** Delete a summary file only when it is one of our summary-*.md artifacts. */
export function removeSummaryFile(file?: string): void {
    if (!file)
        return;
    const name = basename(file);
    if (!/^summary-\d+.*\.md$/i.test(name))
        return;
    const sessions = resolve(getPaths().sessions) + sep;
    if (!resolve(file).startsWith(sessions))
        return;
    try {
        rmSync(file, { force: true });
    }
    catch {
        // Best effort; an orphan summary is not worth failing compaction.
    }
}

function writeSummaryFile(summary: string): string | undefined {
    try {
        const dir = getPaths().sessions;
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `summary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.md`);
        writeFileSync(file, summary, "utf8");
        return file;
    }
    catch {
        return undefined;
    }
}
