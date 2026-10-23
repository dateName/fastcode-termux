import { type PatchHunk } from "./parse.js";
export interface PlannedFile {
    kind: "add" | "delete" | "update";
    relPath: string;
    path: string;
    moveRel?: string;
    moveTo?: string;
    existed: boolean;
    origMode: number;
    eol: "\n" | "\r\n";
    oldContent?: string;
    newContent?: string;
    diff: string;
    changedLines: number;
}
export interface PatchPlan {
    files: PlannedFile[];
    warnings: string[];
}
export type PlanResult = {
    ok: true;
    plan: PatchPlan;
} | {
    ok: false;
    output: string;
};
export type PatchReview = {
    kind: "allow";
} | {
    kind: "deny";
    reason: string;
} | {
    kind: "pending";
    reason: string;
    changedLines: number;
};
export declare function planPatch(patch: string, cwd: string): PlanResult;
export declare function reviewPatchPlan(plan: PatchPlan): PatchReview;
export declare function detectEol(content: string): "\n" | "\r\n";
type ApplyHunksResult = {
    ok: true;
    content: string;
} | {
    ok: false;
    output: string;
};
export declare function applyHunks(oldContent: string, hunks: PatchHunk[]): ApplyHunksResult;
export declare function makeDiff(oldPath: string | null, newPath: string | null, oldContent: string, newContent: string, kind: "add" | "delete" | "update"): string;
export {};
