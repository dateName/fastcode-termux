export declare const expandCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): {
        expandTool: string;
        message?: undefined;
    } | {
        message: string;
        expandTool?: undefined;
    };
};
