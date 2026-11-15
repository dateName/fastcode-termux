import type { CommandContext } from "../types.js";
export declare const threadsCommand: {
    name: string;
    aliases: string[];
    description: string;
    run({ args, actions }: CommandContext): {
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
