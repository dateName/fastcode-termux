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
  | { kind: "allow"; scope: ApprovalScope; label: string }
  | { kind: "deny"; label: string }
  | { kind: "choose"; label: string; value: string }
  | { kind: "feedback"; label: string; prompt: string };

export interface ApprovalRequest {
  id: string;
  tool: string;
  args: unknown;
  reason: ApprovalReason;
  options: ApprovalOption[];
  preview?: ApprovalPreview;
}

export type ApprovalDecision =
  | { kind: "allow"; scope: ApprovalScope }
  | { kind: "deny"; reason?: string; feedback?: string }
  | { kind: "pending"; request: ApprovalRequest };

export type ApprovalResolver = (request: ApprovalRequest) => ApprovalDecision | Promise<ApprovalDecision>;

export const DEFAULT_ALLOW_OPTIONS: ApprovalOption[] = [
  { kind: "allow", scope: "once", label: "Allow once" },
  { kind: "allow", scope: "session", label: "Allow for this session" },
  { kind: "allow", scope: "always", label: "Always allow" },
  { kind: "deny", label: "Deny" },
  { kind: "feedback", label: "Deny with feedback", prompt: "Why should this be denied?" },
];
