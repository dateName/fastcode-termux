export declare const modelCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): Promise<{
        message: string;
    }>;
};
