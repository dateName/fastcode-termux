import { createHash } from "node:crypto";
import { isTrusted } from "../config/trust.js";
import type { ApprovalDecision } from "./approval.js";
import { evaluateShellCommand } from "./guards.js";
import { TOOLS } from "./tools/index.js";
import type { RevalidateKey, StateScope, Tool, ToolCall, ToolCtx, ToolResult } from "./tools/types.js";

const STATE_SCOPES = new Set<StateScope>(["call", "turn", "session"]);
const REVALIDATE_KEYS = new Set<RevalidateKey>(["trust", "sandboxRoots", "schema", "modelCaps"]);

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
    constructor(tools: Tool[] = TOOLS) {
        assertToolContract(tools);
        for (const tool of tools)
            this.tools.set(tool.name, tool);
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
            return { ok: false, output: `unknown tool: ${String(call.tool)}` };
        const prepared = tool.prepare(call, ctx);
        if (prepared.ok === false)
            return { ok: false, output: prepared.output };
        const decision = this.approve(call, ctx);
        if (decision.kind === "deny")
            return { ok: false, output: decision.reason ?? "denied by approval policy" };
        if (decision.kind === "pending")
            return { ok: false, output: "approval required, but no approval resolver is registered (fail closed)" };
        try {
            return await tool.execute(call, ctx);
        }
        catch (err: any) {
            return { ok: false, output: err?.message ?? String(err) };
        }
    }
}

export const registry = new ToolRegistry();

export async function runAgentTool(call: ToolCall, cwd = process.cwd(), options: { signal?: AbortSignal; turn?: number } = {}): Promise<ToolResult> {
    return registry.execute(call, { cwd, signal: options.signal, turn: options.turn });
}
