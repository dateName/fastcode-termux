export const DEFAULT_ALLOW_OPTIONS = [
    { kind: "allow", scope: "once", label: "Allow once" },
    { kind: "allow", scope: "session", label: "Allow for this session" },
    { kind: "allow", scope: "always", label: "Always allow" },
    { kind: "deny", label: "Deny" },
    { kind: "feedback", label: "Deny with feedback", prompt: "Why should this be denied?" },
];
