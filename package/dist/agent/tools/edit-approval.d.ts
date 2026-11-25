import type { ToolCall, ToolCtx, ToolResult } from "./types.js";
export declare function approveLargeEdit(tool: string, call: ToolCall, ctx: ToolCtx, file: string, unified: string, changedLines: number): Promise<ToolResult | undefined>;
