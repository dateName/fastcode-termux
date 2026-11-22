import type { SessionPlan } from "./plan.js";
import { resumeSession } from "./projection.js";
interface AppendableLog {
    file: string;
    append(fact: any): number;
}
export type RevertActionResult = {
    ok: false;
    message: string;
} | {
    ok: true;
    messages: ReturnType<typeof resumeSession>["messages"];
    notice: string;
    targetUserSeq: number;
    removed: number;
};
/** Append a revert fact, then rebuild the projection from the visible facts. */
export declare function applyRevert(log: AppendableLog, n: number, cwd?: string): RevertActionResult;
export type PlanActionResult = {
    ok: false;
    message: string;
} | {
    ok: true;
    messages: ReturnType<typeof resumeSession>["messages"];
    plan: SessionPlan;
};
/** Append a plan fact, then rebuild the projection so the plan marker is visible. */
export declare function applyPlan(log: AppendableLog, plan: SessionPlan, cwd?: string): PlanActionResult;
export {};
