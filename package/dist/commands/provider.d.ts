export declare const providerCommand: {
    name: string;
    description: string;
    run({ args, actions, state }: {
        args: any;
        actions: any;
        state: any;
    }): {
        message: string;
        picker: {
            title: string;
            current: any;
            items: {
                value: string;
                label: string;
                hint: string;
            }[];
            onSelect: (id: any) => void;
        };
    } | {
        message: string;
        picker?: undefined;
    };
};
