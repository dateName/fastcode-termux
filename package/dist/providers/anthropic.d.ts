export declare const anthropicProvider: {
    id: string;
    label: string;
    authEnv: string[];
    baseUrl: string;
    defaultModel: string;
    supportsReasoning(): boolean;
    listModels(apiKey: any): Promise<any>;
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
};
