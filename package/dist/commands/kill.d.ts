export declare const killCommand: {
    name: string;
    description: string;
    run(ctx: any): {
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
            onSelect: (value: any) => void;
        };
    };
};
