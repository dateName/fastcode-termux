export declare function streamChatCompletion(req: any, opts: any): AsyncGenerator<{
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
export declare function listModelsHttp(opts: any): Promise<any>;
