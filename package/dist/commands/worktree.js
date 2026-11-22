import { applyWorktree, createWorktree, listWorktrees, removeWorktree, worktreeDiff } from "../session/worktree.js";
export const worktreeCommand = {
    name: "worktree",
    description: "Git worktree isolation. Usage: /worktree [list|create <slug>|diff <path>|apply <path>|remove <path> [--force]]",
    run({ args }) {
        const sub = (args[0] ?? "list").toLowerCase();
        try {
            if (sub === "list")
                return { message: formatWorktrees(listWorktrees(process.cwd())) };
            if (sub === "create") {
                if (!args[1])
                    return { message: "Usage: /worktree create <slug>" };
                const created = createWorktree(process.cwd(), args[1]);
                return { message: `Created worktree ${created.path} (branch ${created.branch}).\nReview with /worktree diff ${created.path}; apply with /worktree apply ${created.path}.` };
            }
            if (sub === "diff") {
                if (!args[1])
                    return { message: "Usage: /worktree diff <path>" };
                const result = worktreeDiff(args[1]);
                const diff = result.diff.length > 8000 ? result.diff.slice(0, 8000) + "\n[... diff truncated ...]" : result.diff;
                return { message: [`Status:`, result.status.trim() || "(clean)", "", diff || "(no tracked diff)"].join("\n") };
            }
            if (sub === "apply") {
                if (!args[1])
                    return { message: "Usage: /worktree apply <path>" };
                const result = applyWorktree(process.cwd(), args[1]);
                return { message: result.output };
            }
            if (sub === "remove") {
                if (!args[1])
                    return { message: "Usage: /worktree remove <path> [--force]" };
                removeWorktree(process.cwd(), args[1], args.includes("--force"));
                return { message: `Removed worktree ${args[1]}.` };
            }
            return { message: "Usage: /worktree [list|create <slug>|diff <path>|apply <path>|remove <path> [--force]]" };
        }
        catch (err) {
            return { message: `Worktree failed: ${err?.message ?? String(err)}` };
        }
    },
};
function formatWorktrees(entries) {
    if (entries.length === 0)
        return "No git worktrees.";
    return ["Git worktrees:", ...entries.map((entry) => {
            const branch = entry.branch ? ` [${entry.branch}]` : entry.detached ? " [detached]" : "";
            return `  ${entry.path}${branch}`;
        })].join("\n");
}
