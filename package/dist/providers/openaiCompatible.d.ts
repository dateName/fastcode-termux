export declare function streamChatCompletion(req: any, opts: any): AsyncGenerator<{
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
export declare function listModelsHttp(opts: any): Promise<any>;
