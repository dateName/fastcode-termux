import type { ChatChunk, ChatMessage, NativeToolCall, Provider, ReasoningEffort, ToolSchema } from "../types.js";
import type { ActiveFile } from "../session/log.js";
import type { SideEffects } from "./tools/types.js";
import { type CompactionConfig } from "./compaction.js";
import { type ToolProtocol } from "./protocol-mode.js";
export interface ToolCall {
    tool: string;
    [key: string]: any;
}
export interface LoopDetectionOptions {
    readOnlyThreshold?: number;
    sideEffectThreshold?: number;
    window?: number;
    exemptReadOnly?: boolean;
}
export interface RunOptions {
    provider: Provider;
    apiKey?: string;
    model: string;
    messages?: ChatMessage[];
    prompt: string;
    system?: string;
    maxTurns?: number;
    allowTools?: boolean;
    tokenBudget?: number;
    costBudgetUsd?: number;
    signal?: AbortSignal;
    cwd?: string;
    idleTimeoutMs?: number;
    contextBudgetChars?: number;
    compaction?: CompactionConfig;
    contextWindow?: number;
    serverOpaqueState?: string;
    loopDetection?: LoopDetectionOptions;
    reasoningEffort?: ReasoningEffort;
    protocol?: ToolProtocol;
    tools?: ToolSchema[];
    onProtocolFallback?: (message: string) => void;
    onNativeOk?: () => void;
    takeSteering?: () => string[];
    onDelta?: (delta: string, text: string) => void;
}
export type AgentStopReason = "complete" | "max_turns" | "token_budget" | "cost_budget" | "loop_detected" | "aborted" | "incomplete" | "stream_error";
export type AgentErrorKind = "token_budget" | "cost_budget" | "loop_detected" | "aborted" | "stream_error";
export type AgentEvent = {
    type: "compaction";
    beforeChars: number;
    afterChars: number;
    beforeTokens: number;
    afterTokens: number;
    droppedMessages: number;
    keptMessages: number;
    reason: "threshold" | "heap";
    source: "local" | "server";
    summaryFile?: string;
} | {
    type: "assistant_raw";
    text: string;
    toolCalls?: NativeToolCall[];
} | {
    type: "assistant_text";
    text: string;
} | {
    type: "tool_call";
    id: string;
    call: ToolCall;
    native?: boolean;
} | {
    type: "tool_result";
    id: string;
    call: ToolCall;
    ok: boolean;
    output: string;
    sideEffects?: SideEffects;
} | {
    type: "usage";
    usage: NonNullable<ChatChunk["usage"]>;
} | {
    type: "loop_detected";
    fingerprint: string;
    occurrences: number;
    warned: boolean;
} | {
    type: "notice";
    text: string;
} | {
    type: "error";
    kind: AgentErrorKind;
    message: string;
    text?: string;
    used?: number;
} | {
    type: "checkpoint";
    turn: number;
    cwd: string;
    providerId: string;
    model: string;
    activeFiles: ActiveFile[];
} | {
    type: "done";
    history: ChatMessage[];
    finalText: string;
    stopReason: AgentStopReason;
};
export declare const LOOP_WARNING: string;
export declare function runAgent(options: RunOptions): AsyncGenerator<AgentEvent, void, void>;
