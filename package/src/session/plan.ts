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

function status(value: unknown): PlanStatus {
    return value === "in_progress" || value === "done" ? value : "pending";
}

export function normalizePlan(raw: any): SessionPlan {
    const items = Array.isArray(raw?.items)
        ? raw.items
            .filter((item: any) => item && typeof item.text === "string" && item.text.trim())
            .map((item: any, index: number) => ({
                id: index + 1,
                text: item.text.trim(),
                status: status(item.status),
            }))
        : [];
    return {
        ...(typeof raw?.goal === "string" && raw.goal.trim() ? { goal: raw.goal.trim() } : {}),
        items,
    };
}

export function latestPlan(facts: any[]): SessionPlan | undefined {
    for (let index = facts.length - 1; index >= 0; index -= 1) {
        if (facts[index]?.type === "plan")
            return normalizePlan(facts[index]);
    }
    return undefined;
}

export function formatPlan(plan: SessionPlan): string {
    const lines = ["[plan]"];
    if (plan.goal)
        lines.push(`Goal: ${plan.goal}`);
    if (plan.items.length === 0)
        lines.push("(no items)");
    for (const item of plan.items) {
        const mark = item.status === "done" ? "x" : item.status === "in_progress" ? "~" : " ";
        lines.push(`${item.id}. [${mark}] ${item.text}`);
    }
    return lines.join("\n");
}
