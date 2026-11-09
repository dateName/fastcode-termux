import type { CommandContext } from "../types.js";
export declare const threadsCommand: {
    name: string;
    aliases: string[];
    description: string;
    run({ args, actions }: CommandContext): {
        message: string;
    };
};
