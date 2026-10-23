import { parsePatch } from "../../patch/parse.js";
import { planPatch, reviewPatchPlan } from "../../patch/plan.js";
import { applyPatchPlan } from "../../patch/apply.js";
import { invalid, requiredString } from "./validate.js";
/**
 * Atomic multi-file patch.
 *
 * Applies Add / Delete / Update / Move only after every file plan succeeds.
 * Symbolic links are refused, CRLF and mode bits are preserved, and per-file
 * diffs are returned. xattr / ACL are NOT preserved and the inode changes
 * (tmp+rename); restart file watchers if they miss the change.
 */
export const applyPatchTool = {
    name: "apply_patch",
    requiresTrust: true,
    stateScope: "turn",
    revalidate: ["trust", "sandboxRoots"],
    approvalHints: { mayRequireApproval: true },
    prepare(call) {
        let patch;
        try {
            patch = requiredString(call, "patch");
        }
        catch (err) {
            return invalid(err.message);
        }
        const parsed = parsePatch(patch);
        return parsed.ok === false ? invalid(parsed.output) : { ok: true };
    },
    async execute(call, ctx) {
        const patch = requiredString(call, "patch");
        const planned = planPatch(patch, ctx.cwd);
        if (planned.ok === false)
            return { ok: false, output: planned.output };
        const review = reviewPatchPlan(planned.plan);
        if (review.kind === "deny")
            return { ok: false, output: `patch denied: ${review.reason}` };
        if (review.kind === "pending") {
            return {
                ok: false,
                output: `patch needs approval (${review.reason}), but no approval resolver is registered; nothing was written.`,
            };
        }
        const applied = applyPatchPlan(planned.plan);
        const warnings = applied.warnings.length > 0 ? "\n\nwarnings:\n" + applied.warnings.map((line) => "- " + line).join("\n") : "";
        return {
            ok: applied.ok,
            output: applied.output + warnings,
            sideEffects: { touched: applied.touched, removed: applied.removed },
        };
    },
};
