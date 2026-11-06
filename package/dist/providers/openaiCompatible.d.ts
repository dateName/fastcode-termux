import { type RequestSpec } from "./spec.js";
export interface ModelInfo {
    id: string;
    label?: string;
    [key: string]: any;
}
export interface StreamOptions {
    baseUrl: string;
    apiKey?: string;
    chatPath?: string;
    modelsPath?: string | null;
    query?: Record<string, string>;
    pathParams?: Record<string, string>;
    authHeaderName?: string;
    authPrefix?: string;
    staticModels?: ModelInfo[];
    extraHeaders?: Record<string, string>;
    /** Legacy auth prefix, e.g. "Bearer". Prefer authPrefix for new callers. */
    authHeader?: string;
    reasoning?: "openai" | "openrouter" | "none" | string;
}
export declare function toRequestSpec(opts: StreamOptions): RequestSpec;
export declare function streamChatCompletion(req: any, opts: StreamOptions): AsyncGenerator<{
    delta: string;
    done: boolean;
    reasoning?: undefined;
    usage?: undefined;
    toolCalls?: undefined;
} | {
    delta: string;
    done: boolean;
    reasoning: string;
    usage?: undefined;
    toolCalls?: undefined;
} | {
    delta: string;
    done: boolean;
    usage: any;
    toolCalls: import("../types.js").NativeToolCall[];
    reasoning?: undefined;
} | {
    delta: string;
    done: boolean;
    usage: any;
    reasoning?: undefined;
    toolCalls?: undefined;
}, void, unknown>;
export declare function listModelsHttp(opts: StreamOptions): Promise<any>;
