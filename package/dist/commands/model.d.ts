export declare const modelCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): Promise<{
        message: string;
        picker?: undefined;
    } | {
        message: string;
        picker: {
            title: string;
            current: any;
            items: {
                value: any;
                label: any;
                hint: string;
            }[];
            onSelect: (id: any) => void;
        };
    }>;
};
