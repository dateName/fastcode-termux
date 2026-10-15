export declare const clearCommand: {
    name: string;
    description: string;
    aliases: string[];
    run({ actions }: {
        actions: any;
    }): {
        message: string;
        silent: boolean;
    };
};
