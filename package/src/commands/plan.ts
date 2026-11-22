import { formatPlan, normalizePlan, type PlanItem, type SessionPlan } from "../session/plan.js";

function withItems(current: SessionPlan, items: PlanItem[]): SessionPlan {
    return normalizePlan({ ...current, items });
}

function setGoal(current: SessionPlan, args: string[]) {
    if (args.length === 0)
        return { message: current.goal ? `Goal: ${current.goal}` : "No session goal. Set one with /goal <text>." };
    if (args[0].toLowerCase() === "off") {
        const rest: SessionPlan = { items: current.items };
        return { plan: rest };
    }
    return { plan: { ...current, goal: args.join(" ").trim() } };
}

export const planCommand = {
    name: "plan",
    aliases: ["todo", "todos"],
    description: "Show or edit the session plan. Usage: /plan [show|set a; b|add <text>|start <n>|done <n>|remove <n>|clear]",
    run({ args, state }) {
        const current = normalizePlan(state.plan);
        const sub = (args[0] ?? "show").toLowerCase();
        const rest = args.slice(1).join(" ").trim();
        if (sub === "show" || sub === "list")
            return { message: formatPlan(current) };
        if (sub === "set") {
            const texts = rest.split(/\s*;\s*|\n/).map((text) => text.trim()).filter(Boolean);
            if (texts.length === 0)
                return { message: "Usage: /plan set item one; item two" };
            return { plan: withItems(current, texts.map((text, index) => ({ id: index + 1, text, status: "pending" }))) };
        }
        if (sub === "add") {
            if (!rest)
                return { message: "Usage: /plan add <text>" };
            return { plan: withItems(current, [...current.items, { id: current.items.length + 1, text: rest, status: "pending" }]) };
        }
        if (sub === "clear")
            return { plan: { items: [] } };
        if (sub === "goal")
            return setGoal(current, args.slice(1));
        if (["start", "done", "remove"].includes(sub)) {
            const index = Number(args[1]);
            if (!Number.isInteger(index) || index < 1 || index > current.items.length)
                return { message: `Usage: /plan ${sub} <1-${current.items.length}>` };
            const items = current.items
                .map((item) => item.id === index
                    ? { ...item, status: sub === "start" ? "in_progress" : sub === "done" ? "done" : item.status }
                    : item)
                .filter((item) => !(sub === "remove" && item.id === index));
            return { plan: withItems(current, items) };
        }
        return { message: "Usage: /plan [show|set a; b|add <text>|start <n>|done <n>|remove <n>|clear|goal <text>]" };
    },
};

export const goalCommand = {
    name: "goal",
    description: "Show or set the session goal. Usage: /goal <text> | /goal off",
    run({ args, state }) {
        return setGoal(normalizePlan(state.plan), args);
    },
};
