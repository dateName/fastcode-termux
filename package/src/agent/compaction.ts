import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
    enabled: true,
    localThresholdRatio: 0.7,
    keepTurns: 6,
    serverCompactionAware: false,
    clampAboveServerByTokens: 8192,
    maxSummaryTokens: 1500,
    heapLimitMb: 220,
};

export interface CompactionOptions {
    contextWindow: number;
    providerId?: string;
    model?: string;
    force?: boolean;
    serverOpaqueState?: string;
}

export interface CompactionResult {
    messages: ChatMessage[];
    compacted: boolean;
    reason?: "threshold" | "heap";
    source: "local" | "server" | "none";
    beforeTokens: number;
    afterTokens: number;
    beforeChars: number;
    afterChars: number;
    droppedMessages: number;
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
    const reason: "threshold" | "heap" = heap && beforeTokens <= threshold ? "heap" : "threshold";
    if (config.serverCompactionAware && options.serverOpaqueState) {
        return {
            ...noop,
            compacted: true,
            reason,
            source: "server",
        };
    }
    const headCount = messages[0]?.role === "user" ? 1 : 0;
    const keep = Math.max(2, Math.floor(config.keepTurns * 2));
    const tailStart = Math.max(headCount, messages.length - keep);
    if (tailStart <= headCount)
        return noop;
    const middle = messages.slice(headCount, tailStart);
    const summary = buildSummary(middle, config, options);
    const summaryFile = writeSummaryFile(summary);
    const marker: ChatMessage = {
        role: "system",
        content: `[context compacted: ${middle.length} earlier messages were summarized to stay within the context window.` +
            `${summaryFile ? ` Summary file: ${summaryFile}.` : ""} Recent turns are kept verbatim.` +
            " If an earlier detail is missing, re-read that file with a tool.]\n\n" +
            summary,
    };
    const next = [...messages.slice(0, headCount), marker, ...messages.slice(tailStart)];
    return {
        messages: next,
        compacted: true,
        reason,
        source: "local",
        beforeTokens,
        afterTokens: messageTokens(next, options),
        beforeChars,
        afterChars: messageChars(next),
        droppedMessages: middle.length,
        keptMessages: next.length - headCount - 1,
        summary,
        summaryFile,
    };
}

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
        if (message.role === "user") {
            if (message.content.startsWith("FastCode executed the requested local tools.")) {
                for (const line of message.content.split(/\r?\n/)) {
                    if (/error|failed|not found|denied|timed out/i.test(line))
                        outcomes.push(clip(line, 240));
                }
            }
            else {
                requests.push(clip(message.content, 300));
            }
            collectFiles(message.content, files);
            continue;
        }
        if (message.role === "assistant") {
            const calls = parseToolCalls(message.content);
            for (const call of calls)
                actions.push(describeCall(call));
            const visible = stripToolCalls(message.content);
            if (visible)
                notes.push(clip(visible, 300));
            collectFiles(message.content, files);
            continue;
        }
        const lines = message.content.split(/\r?\n/);
        for (const line of lines) {
            if (/error|failed|not found|denied|timed out/i.test(line))
                outcomes.push(clip(line, 240));
        }
        collectFiles(message.content, files);
    }
    const sections = [
        "# Session summary",
        "",
        "## Requests",
        ...limitLines(requests, 8).map((line) => `- ${line}`),
        "",
        "## Actions",
        ...limitLines(actions, 20).map((line) => `- ${line}`),
        "",
        "## Outcomes",
        ...limitLines(outcomes, 10).map((line) => `- ${line}`),
        "",
        "## Files touched",
        ...(files.size > 0 ? Array.from(files).slice(0, 40).map((file) => `- ${file}`) : ["- (none recorded)"]),
        "",
        "## Notes",
        ...limitLines(notes, 10).map((line) => `- ${line}`),
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
    const matches = text.match(/[A-Za-z0-9_@./\\-]+\.[A-Za-z0-9]{1,8}\b/g);
    if (!matches)
        return;
    for (const match of matches) {
        if (match.length <= 3 || match.length > 240)
            continue;
        if (/^\d+(\.\d+)+$/.test(match))
            continue;
        files.add(match);
        if (files.size >= 200)
            return;
    }
}

function limitLines(lines: string[], max: number): string[] {
    return lines.slice(0, max);
}

function clip(text: string, max: number): string {
    const oneLine = String(text).replace(/\s+/g, " ").trim();
    return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
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
