import { DEFAULT_ALLOW_OPTIONS, approvalRequestId } from "../approval.js";
import { approvalKey, isPreApproved, rememberApproval } from "../approval-store.js";
const LARGE_EDIT_LINES = 200;
export async function approveLargeEdit(tool, call, ctx, file, unified, changedLines) {
    if (changedLines <= LARGE_EDIT_LINES)
        return undefined;
    const key = approvalKey(tool, call, ctx.cwd);
    const catalogHash = ctx.catalogHash ?? "";
    if (isPreApproved(key, catalogHash))
        return undefined;
    if (!ctx.requestApproval)
        return { ok: false, output: `${tool} changes ${changedLines} lines and needs approval, but no resolver is registered; nothing was written.`, code: "APPROVAL_DENY" };
    const options = DEFAULT_ALLOW_OPTIONS.map((option) => ({ ...option }));
    const denyIndex = options.findIndex((option) => option.kind === "deny");
    const request = {
        id: approvalRequestId(),
        tool,
        args: call,
        reason: "large_diff",
        options,
        preview: { kind: "diff", text: `${file}: ${changedLines} changed line(s)` },
        patchDiffs: [{ path: file, unified }],
        tier: 2,
        prompt: `Apply ${tool}? ${changedLines} line(s) change`,
        source: "system",
        defaultIndex: denyIndex >= 0 ? denyIndex : 0,
    };
    let decision;
    try {
        decision = await ctx.requestApproval(request);
    }
    catch (err) {
        return { ok: false, output: `${tool} approval failed (fail closed): ${err?.message ?? String(err)}`, code: "APPROVAL_DENY" };
    }
    if (!decision || decision.kind !== "allow") {
        const reason = decision?.kind === "deny" ? decision.reason : decision?.kind === "feedback" ? decision.text : "no allow decision";
        return { ok: false, output: `${tool} denied: ${reason ?? "no reason"}; nothing was written.`, code: "APPROVAL_DENY" };
    }
    rememberApproval(key, catalogHash, decision.scope);
    return undefined;
}
