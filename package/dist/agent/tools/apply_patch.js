import { parsePatch } from "../../patch/parse.js";
import { planPatch, reviewPatchPlan } from "../../patch/plan.js";
import { applyPatchPlan } from "../../patch/apply.js";
import { DEFAULT_ALLOW_OPTIONS, approvalRequestId } from "../approval.js";
import { approvalKey, isPreApproved, rememberApproval } from "../approval-store.js";
import { buildStructuredDiff } from "../../lib/values.js";
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
            return {
                ok: false,
                output: planned.output,
                ...(/(?:path outside sandbox|symbolic link|hard-linked)/i.test(planned.output) ? { code: "SANDBOX_DENY" } : {}),
            };
        const review = reviewPatchPlan(planned.plan);
        if (review.kind === "deny")
            return { ok: false, output: `patch denied: ${review.reason}` };
        if (review.kind === "pending") {
            const key = approvalKey("apply_patch", call, ctx.cwd);
            const catalogHash = ctx.catalogHash ?? "";
            if (!isPreApproved(key, catalogHash)) {
                if (!ctx.requestApproval) {
                    return {
                        ok: false,
                        output: `patch needs approval (${review.reason}), but no approval resolver is registered; nothing was written.`,
                    };
                }
                const request = patchApprovalRequest(call, review, planned.plan);
                let decision;
                try {
                    decision = await ctx.requestApproval(request);
                }
                catch (err) {
                    return { ok: false, output: `patch approval failed (fail closed): ${err?.message ?? String(err)}` };
                }
                if (!decision || decision.kind !== "allow") {
                    const reason = decision?.kind === "deny" ? decision.reason : decision?.kind === "feedback" ? decision.text : "no allow decision";
                    return { ok: false, output: `patch denied: ${reason ?? "no reason"}; nothing was written.` };
                }
                rememberApproval(key, catalogHash, decision.scope);
            }
        }
        const applied = await applyPatchPlan(planned.plan);
        const warnings = applied.warnings.length > 0 ? "\n\nwarnings:\n" + applied.warnings.map((line) => "- " + line).join("\n") : "";
        const diffs = applied.ok
            ? applied.files.map((file) => {
                const plannedFile = planned.plan.files.find((candidate) => (candidate.moveTo ?? candidate.path) === file.path);
                return {
                    path: file.path,
                    unified: file.diff,
                    ...buildStructuredDiff(plannedFile?.oldContent ?? "", plannedFile?.newContent ?? ""),
                };
            })
            : undefined;
        return {
            ok: applied.ok,
            output: applied.output + warnings,
            sideEffects: { touched: applied.touched, removed: applied.removed },
            ...(diffs ? { diffs } : {}),
            ...(applied.atomic === false ? { atomic: false, hint: "atomic rename unavailable; fallback copy used" } : {}),
        };
    },
};
function patchApprovalRequest(call, review, plan) {
    const options = DEFAULT_ALLOW_OPTIONS.map((option) => ({ ...option }));
    const denyIndex = options.findIndex((option) => option.kind === "deny");
    const files = Array.isArray(plan?.files) ? plan.files : [];
    const patchDiffs = files
        .map((file) => ({
        path: String(file.moveTo ?? file.path ?? ""),
        unified: String(file.diff ?? ""),
    }))
        .filter((file) => file.path && file.unified);
    const diff = patchDiffs
        .map((file) => {
        const stats = unifiedDiffStats(file.unified);
        return `${file.path}: +${stats.added} -${stats.removed}`;
    })
        .join("\n");
    return {
        id: approvalRequestId(),
        tool: "apply_patch",
        args: call,
        reason: review.reason.includes("sensitive") ? "sensitive_path" : "large_diff",
        options,
        preview: diff ? { kind: "diff", text: diff } : undefined,
        patchDiffs: patchDiffs.length > 0 ? patchDiffs : undefined,
        tier: 2,
        prompt: `Apply patch? ${review.reason}`,
        source: "system",
        defaultIndex: denyIndex >= 0 ? denyIndex : 0,
    };
}
function unifiedDiffStats(unified) {
    let added = 0;
    let removed = 0;
    for (const line of unified.split(/\r?\n/)) {
        if (line.startsWith("+++") || line.startsWith("---"))
            continue;
        if (line.startsWith("+"))
            added += 1;
        else if (line.startsWith("-"))
            removed += 1;
    }
    return { added, removed };
}
