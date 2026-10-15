export declare const systemCommand: {
    name: string;
    description: string;
    run({ raw, state, actions }: {
        raw: any;
        state: any;
        actions: any;
    }): {
        message: string;
    };
};
