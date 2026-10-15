export declare const customProvider: {
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
