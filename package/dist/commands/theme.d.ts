export declare const themeCommand: {
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
            current: any;
            items: {
                value: string;
                label: any;
                hint: string;
            }[];
            onSelect: (value: any) => void;
        };
    } | {
        message: string;
        picker?: undefined;
    };
};
