export declare const groqProvider: {
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
