import type { AgentEvent } from "./runner.js";
export declare const EVENT_STREAM_VERSION = 1;
export declare class EventStream {
    private readonly sessionId;
    private readonly sink;
    private seq;
    private turn;
    constructor(sessionId: string, sink?: (line: string) => void);
    setTurn(turn: number): void;
    emit(event: Record<string, any>, turn?: number): void;
}
export declare function headlessSessionId(resume?: string): string;
/** Map an AgentEvent to its stable NDJSON payload (without the envelope). */
export declare function serializeAgentEvent(event: AgentEvent): Record<string, any> | undefined;
