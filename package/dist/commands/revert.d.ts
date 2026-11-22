export declare const revertCommand: {
    name: string;
    description: string;
    aliases: string[];
    run({ args }: {
        args: any;
    }): {
        message: string;
        revert?: undefined;
    } | {
        revert: number;
        message?: undefined;
    };
};
