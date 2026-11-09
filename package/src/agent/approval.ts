export type ApprovalScope = "once" | "session" | "always";

export type ApprovalReason =
  | "trust"
  | "sensitive_path"
  | "ambiguous_match"
  | "destructive"
  | "large_diff";

export interface ChoiceItem {
  label: string;
  value: string;
}

export type ApprovalPreview =
  | { kind: "diff"; text: string }
  | { kind: "choices"; items: ChoiceItem[] };

export type ApprovalOption =
  | { kind: "allow"; id?: string; scope: ApprovalScope; label: string }
  | { kind: "deny"; id?: string; label: string }
  | { kind: "choose"; id?: string; label: string; value: string; meta?: { recommended?: boolean; risk?: string; files?: number; reason?: string } }
  | { kind: "feedback"; id?: string; label: string; prompt: string };

export interface ApprovalRequest {
  id: string;
  tool: string;
  args: unknown;
  reason: ApprovalReason;
  options: ApprovalOption[];
  preview?: ApprovalPreview;
  tier?: 0 | 1 | 2 | 3;
  prompt?: string;
  source?: "system" | "ai" | "free";
  defaultIndex?: number;
  timeoutMs?: number;
  freeInput?: { enabled: true; prompt: string; hint?: string };
}

export type ApprovalDecision =
  | { kind: "allow"; scope: ApprovalScope }
  | { kind: "deny"; reason?: string; feedback?: string; code?: string; target?: string }
  | { kind: "pending"; request: ApprovalRequest }
  | { kind: "choose"; value: string; input?: string }
  | { kind: "feedback"; text: string };

export type ApprovalResolver = (request: ApprovalRequest) => ApprovalDecision | Promise<ApprovalDecision>;

export const DEFAULT_ALLOW_OPTIONS: ApprovalOption[] = [
  { kind: "allow", id: "allow-once", scope: "once", label: "Allow once" },
  { kind: "allow", id: "allow-session", scope: "session", label: "Allow for this session" },
  { kind: "allow", id: "allow-always", scope: "always", label: "Always allow" },
  { kind: "deny", id: "deny", label: "Deny" },
  { kind: "feedback", id: "feedback", label: "Deny with feedback", prompt: "Why should this be denied?" },
];

export function approvalRequestId(): string {
  return "ap_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function approvalOptionForDecision(request: ApprovalRequest, decision: ApprovalDecision): ApprovalOption | undefined {
  if (decision.kind === "allow")
    return request.options.find((option) => option.kind === "allow" && option.scope === decision.scope);
  if (decision.kind === "deny")
    return request.options.find((option) => option.kind === "deny");
  if (decision.kind === "choose")
    return request.options.find((option) => option.kind === "choose" && option.value === decision.value);
  if (decision.kind === "feedback")
    return request.options.find((option) => option.kind === "feedback");
  return undefined;
}

export function parseApprovalChoice(request: ApprovalRequest, text: string): ApprovalOption | undefined {
    const index = Number(String(text ?? "").trim()) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= request.options.length)
        return undefined;
    return request.options[index];
}

export function decisionForOption(option: ApprovalOption, input?: string): ApprovalDecision {
  if (option.kind === "allow")
    return { kind: "allow", scope: option.scope };
  if (option.kind === "choose")
    return { kind: "choose", value: option.value };
  if (option.kind === "feedback") {
    const text = typeof input === "string" ? input.trim() : "";
    // The option's prompt is the question, not the user's answer. Without an
    // actual answer, fail closed instead of sending the prompt back to the model.
    return text
      ? { kind: "feedback", text }
      : { kind: "deny", reason: "feedback was required but not provided (fail closed)" };
  }
  return { kind: "deny", reason: "denied by user" };
}
