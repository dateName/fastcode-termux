export declare const attachCommand: {
    name: string;
    description: string;
    run({ args }: {
        args: any;
    }): Promise<{
        message: string;
    }>;
};
