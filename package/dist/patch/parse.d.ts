export type PatchLineType = " " | "-" | "+";
export interface PatchLine {
    type: PatchLineType;
    text: string;
}
export interface PatchHunk {
    lines: PatchLine[];
}
export type PatchOp = {
    kind: "add";
    path: string;
    lines: string[];
} | {
    kind: "delete";
    path: string;
} | {
    kind: "update";
    path: string;
    hunks: PatchHunk[];
    moveTo?: string;
};
export type ParseResult = {
    ok: true;
    ops: PatchOp[];
} | {
    ok: false;
    output: string;
};
export declare function parsePatch(patch: string): ParseResult;
