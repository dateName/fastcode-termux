import type { ApprovalDecision } from "./approval.js";
import type { Tool, ToolCall, ToolCtx, ToolResult } from "./tools/types.js";
export declare function assertToolContract(tools?: Tool[]): void;
export declare function toolCatalogHash(tools?: Tool[]): string;
export declare class ToolRegistry {
    private readonly tools;
    constructor(tools?: Tool[]);
    get(name: string): Tool | undefined;
    list(): Tool[];
    approve(call: ToolCall, ctx: ToolCtx): ApprovalDecision;
    execute(call: ToolCall, ctx: ToolCtx): Promise<ToolResult>;
}
export declare const registry: ToolRegistry;
export declare function runAgentTool(call: ToolCall, cwd?: string, options?: {
    signal?: AbortSignal;
    turn?: number;
}): Promise<ToolResult>;
