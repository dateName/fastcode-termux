export declare const COMMANDS: any;
export declare function findCommand(name: any): any;
/** Parse a raw input string. Returns undefined if it's not a slash command. */
export declare function parseSlash(input: any): {
    name: any;
    args: any;
    raw: any;
};
export declare function runCommand(cmd: any, ctx: any): Promise<any>;
