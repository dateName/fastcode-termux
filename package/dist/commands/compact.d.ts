export declare const compactCommand: {
    name: string;
    description: string;
    run({ state, actions }: {
        state: any;
        actions: any;
    }): {
        message: string;
        compacted?: undefined;
    } | {
        message: string;
        compacted: {
            summaryRef: string;
            source: string;
            beforeTokens: number;
            afterTokens: number;
            droppedMessages: number;
            keepMessages: number;
            reason: string;
        };
    };
};
