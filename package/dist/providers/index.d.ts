export declare const PROVIDERS: ({
    id: string;
    label: string;
    authEnv: string[];
    baseUrl: string;
    defaultModel: string;
    listModels(): Promise<({
        id: string;
        label: string;
        contextWindow: number;
        pricing: {
            inputUsdPerM: number;
            outputUsdPerM: number;
        };
    } | {
        id: string;
        label: string;
        contextWindow?: undefined;
        pricing?: undefined;
    })[]>;
    stream(req: any, apiKey: any): AsyncGenerator<{
        delta: any;
        done: boolean;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: {
            inputTokens: number;
            outputTokens: number;
            costUsd: number;
        };
    }, void, unknown>;
} | {
    id: string;
    label: string;
    authEnv: string[];
    readonly baseUrl: string;
    defaultModel: string;
    listModels: (apiKey: any) => Promise<any>;
    stream: (req: any, apiKey: any) => AsyncGenerator<{
        delta: string;
        done: boolean;
        reasoning?: undefined;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        reasoning?: undefined;
    }, void, unknown>;
} | {
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
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        reasoning?: undefined;
    }, void, unknown>;
})[];
export declare function getProvider(id: any): {
    id: string;
    label: string;
    authEnv: string[];
    baseUrl: string;
    defaultModel: string;
    listModels(): Promise<({
        id: string;
        label: string;
        contextWindow: number;
        pricing: {
            inputUsdPerM: number;
            outputUsdPerM: number;
        };
    } | {
        id: string;
        label: string;
        contextWindow?: undefined;
        pricing?: undefined;
    })[]>;
    stream(req: any, apiKey: any): AsyncGenerator<{
        delta: any;
        done: boolean;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: {
            inputTokens: number;
            outputTokens: number;
            costUsd: number;
        };
    }, void, unknown>;
} | {
    id: string;
    label: string;
    authEnv: string[];
    readonly baseUrl: string;
    defaultModel: string;
    listModels: (apiKey: any) => Promise<any>;
    stream: (req: any, apiKey: any) => AsyncGenerator<{
        delta: string;
        done: boolean;
        reasoning?: undefined;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        reasoning?: undefined;
    }, void, unknown>;
} | {
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
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        reasoning?: undefined;
    }, void, unknown>;
};
export declare function getProviderOrThrow(id: any): {
    id: string;
    label: string;
    authEnv: string[];
    baseUrl: string;
    defaultModel: string;
    listModels(): Promise<({
        id: string;
        label: string;
        contextWindow: number;
        pricing: {
            inputUsdPerM: number;
            outputUsdPerM: number;
        };
    } | {
        id: string;
        label: string;
        contextWindow?: undefined;
        pricing?: undefined;
    })[]>;
    stream(req: any, apiKey: any): AsyncGenerator<{
        delta: any;
        done: boolean;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: {
            inputTokens: number;
            outputTokens: number;
            costUsd: number;
        };
    }, void, unknown>;
} | {
    id: string;
    label: string;
    authEnv: string[];
    readonly baseUrl: string;
    defaultModel: string;
    listModels: (apiKey: any) => Promise<any>;
    stream: (req: any, apiKey: any) => AsyncGenerator<{
        delta: string;
        done: boolean;
        reasoning?: undefined;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        reasoning?: undefined;
    }, void, unknown>;
} | {
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
    } | {
        delta: string;
        done: boolean;
        reasoning: string;
        usage?: undefined;
    } | {
        delta: string;
        done: boolean;
        usage: any;
        reasoning?: undefined;
    }, void, unknown>;
};
