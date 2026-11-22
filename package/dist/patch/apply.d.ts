import type { PatchPlan, PlannedFile } from "./plan.js";
export interface AppliedFile {
    path: string;
    kind: PlannedFile["kind"];
    diff: string;
}
export interface ApplyResult {
    ok: boolean;
    output: string;
    files: AppliedFile[];
    touched: string[];
    removed: string[];
    warnings: string[];
    atomic: boolean;
}
export declare function applyPatchPlan(plan: PatchPlan): Promise<ApplyResult>;
