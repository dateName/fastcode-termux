/** Line-based diff primitives shared by patch planning and edit previews. */
export interface DiffLine {
    type: " " | "-" | "+";
    text: string;
    oldLine: number;
    newLine: number;
}
export interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: DiffLine[];
}
interface SplitContent {
    lines: string[];
    endsWithNewline: boolean;
}
export declare function splitContent(content: string): SplitContent;
export declare function diffLines(oldContent: string, newContent: string): DiffLine[];
/** Group changes with three context lines; distant edits become separate hunks. */
export declare function diffHunks(oldContent: string, newContent: string, context?: number): DiffHunk[];
export declare function countChangedLines(oldContent: string, newContent: string): number;
export declare function unifiedDiff(oldPath: string | null, newPath: string | null, oldContent: string, newContent: string, kind: "add" | "delete" | "update", context?: number): string;
export {};
