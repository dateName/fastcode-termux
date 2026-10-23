export type StateScope = "call" | "turn" | "session";

export type RevalidateKey = "trust" | "sandboxRoots" | "schema" | "modelCaps";

export interface SideEffects {
  touched?: string[];
  created?: string[];
  removed?: string[];
}

export interface ToolCall {
  tool: string;
  [key: string]: any;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  sideEffects?: SideEffects;
}

export interface ToolCtx {
    cwd: string;
    signal?: AbortSignal;
    turn?: number;
}

export type Prepared = { ok: true } | { ok: false; output: string };

export interface ApprovalHints {
  mayRequireApproval: boolean;
}

export interface Tool {
  name: string;
  requiresTrust?: boolean;
  stateScope: StateScope;
  revalidate?: RevalidateKey[];
  approvalHints?: ApprovalHints;
  prepare(call: ToolCall, ctx: ToolCtx): Prepared;
  execute(call: ToolCall, ctx: ToolCtx): Promise<ToolResult>;
}
