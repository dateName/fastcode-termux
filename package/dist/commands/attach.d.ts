export declare const attachCommand: {
    name: string;
    description: string;
    run({ args, actions }: {
        args: any;
        actions: any;
    }): Promise<{
        message: string;
        picker?: undefined;
    } | {
        message: string;
        picker: {
            title: string;
            items: {
                value: string;
                label: string;
                hint: string;
            }[];
            onSelect: (value: any) => Promise<void>;
        };
    }>;
};
