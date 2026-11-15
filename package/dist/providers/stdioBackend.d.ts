import type { ChatChunk, Provider, ProviderModel } from "../types.js";
export interface StdioBackendConfig {
    id: string;
    label: string;
    /** Executable to spawn (not a shell string). */
    command: string;
    /** Fixed argv. */
    args?: string[];
    /** Extra argv applied to every turn. */
    turnArgs?: string[];
    cwd?: string;
    /** Extra environment names allowed through from the host. */
    envAllowlist?: string[];
    /** Explicitly injected values (applied after the allowlist). */
    env?: Record<string, string | undefined>;
    staticModels?: ProviderModel[];
    /** How many stderr lines to keep for a failure tail. */
    stderrLines?: number;
}
type CanonicalEvent = {
    type: "text-delta";
    text: string;
} | {
    type: "thinking-delta";
    text: string;
} | {
    type: "tool-call";
    id?: string;
    name: string;
    arguments: string;
} | {
    type: "usage";
    usage: NonNullable<ChatChunk["usage"]>;
} | {
    type: "error";
    message: string;
} | {
    type: "done";
};
/** Parse one stdout line; debug noise and malformed lines are skipped. */
export declare function parseCanonicalLine(line: string): CanonicalEvent | undefined;
/**
 * Build a Provider that runs one child per turn and consumes canonical NDJSON.
 * The provider is intentionally not registered by default: enabling a CLI
 * backend is an explicit configuration decision.
 */
export declare function createStdioProvider(config: StdioBackendConfig): Provider;
export {};
