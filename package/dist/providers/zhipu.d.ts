export declare const zhipuProvider: {
    id: string;
    label: string;
    authEnv: string[];
    readonly baseUrl: string;
    defaultModel: string;
    listModels: (apiKey: any) => Promise<any>;
    stream: (req: any, apiKey: any) => AsyncGenerator<{
        delta: any;
        done: boolean;
        suppressPseudoParse: boolean;
        reasoning?: undefined;
        usage?: undefined;
        toolCalls?: undefined;
    } | {
        toolCalls?: import("../types.js").NativeToolCall[];
        usage?: {
            inputTokens: any;
            outputTokens: any;
            totalTokens: any;
        };
        delta: string;
        done: boolean;
        suppressPseudoParse: boolean;
        reasoning?: undefined;
    } | {
        delta: string;
        done: boolean;
        suppressPseudoParse?: undefined;
        reasoning?: undefined;
        usage?: undefined;
        toolCalls?: undefined;
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        suppressPseudoParse?: undefined;
        usage?: undefined;
        toolCalls?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        toolCalls: import("../types.js").NativeToolCall[];
        suppressPseudoParse?: undefined;
        reasoning?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        suppressPseudoParse?: undefined;
        reasoning?: undefined;
        toolCalls?: undefined;
    }, void, unknown>;
    supportsReasoning: () => boolean;
};
