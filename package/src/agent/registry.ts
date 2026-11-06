import { createHash } from "node:crypto";
import { isTrusted } from "../config/trust.js";
import {
    DEFAULT_ALLOW_OPTIONS,
    approvalRequestId,
    type ApprovalDecision,
    type ApprovalOption,
    type ApprovalRequest,
} from "./approval.js";
import { approvalKey, isPreApproved, rememberApproval } from "./approval-store.js";
import { evaluateShellCommand } from "./guards.js";
import { TOOLS } from "./tools/index.js";
import type { RevalidateKey, SideEffects, StateScope, Tool, ToolCall, ToolCtx, ToolErrorCode, ToolResult } from "./tools/types.js";
import { loadConfig } from "../config/store.js";
import {
    egressAudit,
    evaluateEgressCall,
    evaluateEgressOutput,
    formatEgressDenial,
    normalizeEgressConfig,
} from "./policy/egress.js";

const STATE_SCOPES = new Set<StateScope>(["call", "turn", "session"]);
const REVALIDATE_KEYS = new Set<RevalidateKey>(["trust", "sandboxRoots", "schema", "modelCaps"]);
const TOOL_ERROR_CODES = new Set<ToolErrorCode>([
    "ENOENT", "EACCES", "EEXIST", "ENOTDIR", "EISDIR", "EXDEV", "INVALID_ARGS",
    "SANDBOX_DENY", "APPROVAL_DENY", "EGRESS_DENY", "NOT_FOUND", "ABORTED", "UNKNOWN",
]);

function errorCode(error: any): ToolErrorCode {
    const code = String(error?.code ?? "");
    if (TOOL_ERROR_CODES.has(code as ToolErrorCode))
        return code as ToolErrorCode;
    const message = String(error?.message ?? error ?? "");
    if (/outside sandbox/i.test(message))
        return "SANDBOX_DENY";
    if (/not trusted/i.test(message))
        return "APPROVAL_DENY";
    if (/aborted/i.test(message))
        return "ABORTED";
    return "UNKNOWN";
}

function unique(values: string[] | undefined): string[] {
    return Array.from(new Set((values ?? []).filter(Boolean)));
}

function normalizeSideEffects(sideEffects: SideEffects | undefined): SideEffects | undefined {
    if (!sideEffects)
        return undefined;
    const touched = unique(sideEffects.touched);
    const created = unique(sideEffects.created);
    const removed = unique(sideEffects.removed);
    if (touched.length === 0 && created.length === 0 && removed.length === 0)
        return undefined;
    return {
        ...(touched.length > 0 ? { touched } : {}),
        ...(created.length > 0 ? { created } : {}),
        ...(removed.length > 0 ? { removed } : {}),
    };
}

export function assertToolContract(tools: Tool[] = TOOLS): void {
    const names = new Set<string>();
    for (const tool of tools) {
        if (!tool.name || typeof tool.name !== "string")
            throw new Error("tool contract: every tool needs a name");
        if (names.has(tool.name))
            throw new Error(`tool contract: duplicate tool name ${tool.name}`);
        names.add(tool.name);
        if (!STATE_SCOPES.has(tool.stateScope))
            throw new Error(`tool contract: ${tool.name} has an invalid stateScope`);
        for (const key of tool.revalidate ?? []) {
            if (!REVALIDATE_KEYS.has(key))
                throw new Error(`tool contract: ${tool.name} has an invalid revalidate key ${String(key)}`);
        }
        if (tool.requiresTrust && !(tool.revalidate ?? []).includes("trust")) {
            throw new Error(`tool contract: ${tool.name} requiresTrust but does not revalidate "trust"`);
        }
    }
}

export function toolCatalogHash(tools: Tool[] = TOOLS): string {
    const catalog = tools
        .map((tool) => ({
            name: tool.name,
            trust: Boolean(tool.requiresTrust),
            scope: tool.stateScope,
            revalidate: [...(tool.revalidate ?? [])].sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return createHash("sha1").update(JSON.stringify(catalog)).digest("hex").slice(0, 8);
}

export class ToolRegistry {
    private readonly tools = new Map<string, Tool>();
    private readonly catalogHash: string;
    constructor(tools: Tool[] = TOOLS) {
        assertToolContract(tools);
        for (const tool of tools)
            this.tools.set(tool.name, tool);
        this.catalogHash = toolCatalogHash(tools);
    }
    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }
    list(): Tool[] {
        return Array.from(this.tools.values());
    }
    approve(call: ToolCall, ctx: ToolCtx): ApprovalDecision {
        const tool = this.get(call.tool);
        if (!tool)
            return { kind: "deny", reason: `unknown tool: ${String(call.tool)}` };
        if (tool.name === "shell") {
            const verdict = evaluateShellCommand(call.command);
            if (verdict.action === "hard_block")
                return { kind: "deny", reason: verdict.output, code: verdict.code, target: verdict.target };
            if (verdict.action === "soft_gate") {
                const key = approvalKey(tool.name, call, ctx.cwd);
                if (isPreApproved(key, this.catalogHash))
                    return { kind: "allow", scope: "once" };
                return { kind: "pending", request: shellApprovalRequest(call, verdict) };
            }
            if (!verdict.allow)
                return { kind: "deny", reason: verdict.output };
        }
        if ((tool.revalidate ?? []).includes("trust") && !isTrusted(ctx.cwd)) {
            return {
                kind: "deny",
                reason: `project is not trusted: ${ctx.cwd}. Run \`fastcode trust ${ctx.cwd}\` or accept the trust prompt.`,
            };
        }
        return { kind: "allow", scope: "once" };
    }
    async execute(call: ToolCall, ctx: ToolCtx): Promise<ToolResult> {
        const tool = this.get(call.tool);
        if (!tool)
            return { ok: false, output: `unknown tool: ${String(call.tool)}`, code: "INVALID_ARGS" };
        const toolCtx: ToolCtx = { ...ctx, catalogHash: this.catalogHash };
        const prepared = tool.prepare(call, toolCtx);
        if (prepared.ok === false)
            return { ok: false, output: prepared.output, code: prepared.code ?? "INVALID_ARGS", hint: prepared.hint };
        const egressConfig = normalizeEgressConfig(loadConfig().egress);
        const preEgress = evaluateEgressCall(call, ctx.cwd, egressConfig);
        if (preEgress.action === "deny") {
            const egressDecision = preEgress.decision!;
            return {
                ok: false,
                output: formatEgressDenial(egressDecision),
                code: "EGRESS_DENY",
                hint: "Egress policy blocked this call before execution; no approval request was created.",
                egress: egressAudit(egressDecision),
            };
        }
        const preAudit = preEgress.decision ? egressAudit(preEgress.decision) : undefined;
        const decision = this.approve(call, toolCtx);
        if (decision.kind === "deny") {
            const output = decision.reason ?? "denied by approval policy";
            if (tool.name === "shell" && (decision.code === "sensitive_file_egress" || decision.code === "credential_read")) {
                return {
                    ok: false,
                    output,
                    code: "EGRESS_DENY",
                    egress: {
                        outlet: "shell.command",
                        ...(decision.target ? { target: decision.target } : {}),
                        rule: decision.code,
                        mode: "block",
                        wouldBlock: true,
                        code: "EGRESS_DENY",
                        reason: decision.code,
                    },
                };
            }
            return { ok: false, output, code: "APPROVAL_DENY" };
        }
        if (decision.kind === "pending") {
            if (!ctx.requestApproval)
                return { ok: false, output: "approval required, but no approval resolver is registered (fail closed)", code: "APPROVAL_DENY" };
            let resolved: ApprovalDecision | undefined;
            try {
                resolved = await ctx.requestApproval(decision.request);
            }
            catch (err: any) {
                return { ok: false, output: `approval failed (fail closed): ${err?.message ?? String(err)}`, code: "APPROVAL_DENY" };
            }
            if (!resolved || resolved.kind === "pending")
                return { ok: false, output: "approval unresolved; nothing was executed (fail closed)", code: "APPROVAL_DENY" };
            if (resolved.kind !== "allow") {
                const reason = resolved.kind === "deny" ? resolved.reason : resolved.kind === "feedback" ? resolved.text : `decision ${resolved.kind} requires a later batch`;
                return { ok: false, output: `approval denied: ${reason ?? "no reason"}`, code: "APPROVAL_DENY" };
            }
            rememberApproval(approvalKey(tool.name, call, ctx.cwd), this.catalogHash, resolved.scope);
        }
        try {
            let result: ToolResult = await tool.execute(call, toolCtx);
            result = {
                ...result,
                sideEffects: normalizeSideEffects(result.sideEffects),
                ...(preAudit && !result.egress ? { egress: preAudit } : {}),
            };
            const postEgress = evaluateEgressOutput(call.tool, result.output, egressConfig);
            if (postEgress.action === "deny") {
                const egressDecision = postEgress.decision!;
                return {
                    ok: false,
                    output: formatEgressDenial(egressDecision),
                    code: "EGRESS_DENY",
                    hint: "Egress policy blocked this tool output before it reached the model.",
                    sideEffects: result.sideEffects,
                    egress: egressAudit(egressDecision),
                };
            }
            if (postEgress.decision)
                result = { ...result, egress: egressAudit(postEgress.decision) };
            return result;
        }
        catch (err: any) {
            const output = err?.message ?? String(err);
            const postEgress = evaluateEgressOutput(call.tool, output, egressConfig);
            if (postEgress.action === "deny") {
                const egressDecision = postEgress.decision!;
                return {
                    ok: false,
                    output: formatEgressDenial(egressDecision),
                    code: "EGRESS_DENY",
                    hint: "Egress policy blocked this error output before it reached the model.",
                    egress: egressAudit(egressDecision),
                };
            }
            return {
                ok: false,
                output,
                code: errorCode(err),
                ...(preAudit ? { egress: preAudit } : {}),
                ...(postEgress.decision ? { egress: egressAudit(postEgress.decision) } : {}),
            };
        }
    }
}

function shellApprovalRequest(call: ToolCall, verdict: { code: string; target?: string; reason?: string; output?: string }): ApprovalRequest {
    const options = DEFAULT_ALLOW_OPTIONS.map((option) => ({ ...option })) as ApprovalOption[];
    const denyIndex = options.findIndex((option) => option.kind === "deny");
    const target = verdict.target ?? "";
    const prompt = `Shell command needs approval: ${verdict.code}${target ? ` (${target})` : ""}`;
    return {
        id: approvalRequestId(),
        tool: "shell",
        args: call,
        reason: "destructive",
        options,
        tier: 2,
        prompt,
        source: "system",
        defaultIndex: denyIndex >= 0 ? denyIndex : 0,
        timeoutMs: 60_000,
    };
}

export const registry = new ToolRegistry();

export async function runAgentTool(call: ToolCall, cwd = process.cwd(), options: { signal?: AbortSignal; turn?: number; requestApproval?: import("./approval.js").ApprovalResolver } = {}): Promise<ToolResult> {
    return registry.execute(call, {
        cwd,
        signal: options.signal,
        turn: options.turn,
        requestApproval: options.requestApproval,
    });
}
