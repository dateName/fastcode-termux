export declare const xaiProvider: {
    id: string;
    label: string;
    authEnv: string[];
    baseUrl: string;
    defaultModel: string;
    listModels: (apiKey: any) => Promise<any>;
    stream: (req: any, apiKey: any) => AsyncGenerator<{
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
    supportsReasoning: () => boolean;
};
