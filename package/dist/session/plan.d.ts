export type PlanStatus = "pending" | "in_progress" | "done";
export interface PlanItem {
    id: number;
    text: string;
    status: PlanStatus;
}
export interface SessionPlan {
    goal?: string;
    items: PlanItem[];
}
export declare function normalizePlan(raw: any): SessionPlan;
export declare function latestPlan(facts: any[]): SessionPlan | undefined;
export declare function formatPlan(plan: SessionPlan): string;
