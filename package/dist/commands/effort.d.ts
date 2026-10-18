import type { ReasoningEffort } from "../types.js";
export declare const effortCommand: {
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
                value: ReasoningEffort;
                label: ReasoningEffort;
                hint: string;
            }[];
            onSelect: (value: any) => any;
        };
    };
};
