export declare const pluginCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): {
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
                hint: any;
            }[];
            onSelect: (value: any) => void;
        };
    } | {
        message: string;
        picker: {
            title: string;
            items: {
                value: any;
                label: any;
                hint: any;
            }[];
            onSelect: (value: any) => void;
            current?: undefined;
        };
    };
};
