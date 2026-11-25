export declare const compactCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): {
        message: string;
        compactionCleaned?: undefined;
        compacted?: undefined;
    } | {
        message: string;
        compactionCleaned: {
            refs: any[];
        };
        compacted?: undefined;
    } | {
        message: string;
        compacted: {
            keepMessages: number;
            reason: string;
            droppedSeqUnmapped?: boolean;
            droppedCount?: number;
            droppedToSeq?: number;
            droppedFromSeq?: number;
            summaryRef: string;
            source: string;
            beforeTokens: number;
            afterTokens: number;
            droppedMessages: number;
        };
        compactionCleaned?: undefined;
    };
};
