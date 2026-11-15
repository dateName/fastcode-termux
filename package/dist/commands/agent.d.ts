export declare const agentCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): {
        message: string;
        picker: {
            title: string;
            current: string;
            items: {
                value: string;
                label: string;
                hint: string;
            }[];
            onSelect: (value: any) => void;
        };
    } | {
        message: string;
        picker?: undefined;
    };
};
