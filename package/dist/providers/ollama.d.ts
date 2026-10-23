export declare const ollamaProvider: {
    id: string;
    label: string;
    authEnv: any[];
    readonly baseUrl: string;
    defaultModel: string;
    listModels: () => Promise<any>;
    stream: (req: any) => AsyncGenerator<{
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
};
