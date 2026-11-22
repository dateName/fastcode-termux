export type InstructionScope = "global" | "project" | "local";
export interface InstructionEntry {
    path: string;
    scope: InstructionScope;
    content: string;
    truncated: boolean;
}
export interface InstructionBundle {
    entries: InstructionEntry[];
    text: string;
    hash: string;
}
/** Discover instruction files from the global data dir, project root and cwd chain. */
export declare function discoverInstructions(cwd?: string): InstructionBundle;
export declare function formatInstructionPrompt(entries: InstructionEntry[]): string;
