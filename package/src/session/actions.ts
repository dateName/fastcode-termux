import type { SessionPlan } from "./plan.js";
import { readSession } from "./log.js";
import { resumeSession, revertBoundary } from "./projection.js";

interface AppendableLog {
    file: string;
    append(fact: any): number;
}

export type RevertActionResult =
    | { ok: false; message: string }
    | {
        ok: true;
        messages: ReturnType<typeof resumeSession>["messages"];
        notice: string;
        targetUserSeq: number;
        removed: number;
    };

/** Append a revert fact, then rebuild the projection from the visible facts. */
export function applyRevert(log: AppendableLog, n: number, cwd = process.cwd()): RevertActionResult {
    const boundary = revertBoundary(readSession(log.file), n);
    if (!boundary)
        return { ok: false, message: `Cannot revert to user message ${n}; use /revert <n> with n between 1 and the current user message count.` };
    const seq = log.append({
        type: "revert",
        targetUserSeq: boundary.targetUserSeq,
        keepBeforeSeq: boundary.keepBeforeSeq,
        removed: boundary.removed,
    });
    if (!seq)
        return { ok: false, message: "Could not persist the revert (session logging is degraded)." };
    const rebuilt = resumeSession(log.file, cwd);
    return {
        ok: true,
        messages: rebuilt.messages,
        notice: `Reverted to before user message ${n} (${boundary.removed} fact(s) ignored).`,
        targetUserSeq: boundary.targetUserSeq,
        removed: boundary.removed,
    };
}

export type PlanActionResult =
    | { ok: false; message: string }
    | {
        ok: true;
        messages: ReturnType<typeof resumeSession>["messages"];
        plan: SessionPlan;
    };

/** Append a plan fact, then rebuild the projection so the plan marker is visible. */
export function applyPlan(log: AppendableLog, plan: SessionPlan, cwd = process.cwd()): PlanActionResult {
    const seq = log.append({ type: "plan", ...plan });
    if (!seq)
        return { ok: false, message: "Could not persist the plan (session logging is degraded)." };
    const rebuilt = resumeSession(log.file, cwd);
    return { ok: true, messages: rebuilt.messages, plan };
}
