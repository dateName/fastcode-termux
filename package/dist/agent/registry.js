import { createHash } from "node:crypto";
import { isTrusted } from "../config/trust.js";
import { evaluateShellCommand } from "./guards.js";
import { TOOLS } from "./tools/index.js";
const STATE_SCOPES = new Set(["call", "turn", "session"]);
const REVALIDATE_KEYS = new Set(["trust", "sandboxRoots", "schema", "modelCaps"]);
export function assertToolContract(tools = TOOLS) {
    const names = new Set();
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
export function toolCatalogHash(tools = TOOLS) {
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
    tools = new Map();
    constructor(tools = TOOLS) {
        assertToolContract(tools);
        for (const tool of tools)
            this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return Array.from(this.tools.values());
    }
    approve(call, ctx) {
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
    async execute(call, ctx) {
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
        catch (err) {
            return { ok: false, output: err?.message ?? String(err) };
        }
    }
}
export const registry = new ToolRegistry();
export async function runAgentTool(call, cwd = process.cwd(), options = {}) {
    return registry.execute(call, { cwd, signal: options.signal, turn: options.turn });
}
