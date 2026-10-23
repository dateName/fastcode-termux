import type { ChatMessage } from "../types.js";
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
export declare const DEFAULT_COMPACTION_CONFIG: CompactionConfig;
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
export declare function compactionConfigFromEnv(): CompactionConfig;
export declare function localThresholdTokens(config: CompactionConfig, contextWindow: number): number;
export declare function heapExceeded(config: CompactionConfig): boolean;
export declare function shouldCompact(messages: ChatMessage[], config: CompactionConfig, options: CompactionOptions): boolean;
export declare function compactMessages(messages: ChatMessage[], config: CompactionConfig, options: CompactionOptions): CompactionResult;
export declare function buildSummary(messages: ChatMessage[], config: CompactionConfig, options: Pick<CompactionOptions, "providerId" | "model">): string;
