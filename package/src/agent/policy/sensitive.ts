/**
 * Structured sensitive-content detection.
 *
 * Detection is shared by egress, retention and export. It deliberately does
 * not decide how a match is handled; each consumer owns its own policy.
 */
import { DEFAULT_CONTENT_MARKERS } from "./defaults.js";

export const RULESET_VERSION = "1";

export type SensitiveCategory = "provider_key" | "private_key" | "secret_assignment" | "connection_string";
export type SensitiveConsumer = "egress" | "retention" | "export";

export interface SensitiveRule {
    id: string;
    category: SensitiveCategory;
    pattern: string;
    appliesTo: SensitiveConsumer[];
}

export interface SensitiveMatch {
    ruleId: string;
    category: SensitiveCategory;
    start: number;
    end: number;
}

const CORE_IDS = [
    "private-key",
    "aws-access-key",
    "github-token",
    "slack-token",
    "google-api-key",
    "openai-key",
];

const CORE_CATEGORIES: SensitiveCategory[] = [
    "private_key",
    "provider_key",
    "provider_key",
    "provider_key",
    "provider_key",
    "provider_key",
];

export const SENSITIVE_RULES: SensitiveRule[] = [
    ...DEFAULT_CONTENT_MARKERS.map((pattern, index) => ({
        id: CORE_IDS[index] ?? `builtin-${index}`,
        category: CORE_CATEGORIES[index] ?? "provider_key",
        pattern,
        appliesTo: ["egress", "retention", "export"] as SensitiveConsumer[],
    })),
    {
        id: "bearer-jwt",
        category: "provider_key",
        pattern: "Bearer\\s+eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+",
        appliesTo: ["egress", "retention", "export"],
    },
    {
        id: "secret-assignment",
        category: "secret_assignment",
        pattern: "(PASSWORD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY)\\s*=\\s*\\S+",
        appliesTo: ["egress", "retention", "export"],
    },
    {
        id: "connection-credential",
        category: "connection_string",
        pattern: "://[^\\s/:@]+:[^\\s/@]+@",
        appliesTo: ["egress", "retention", "export"],
    },
];

const compiled = new Map<string, RegExp>();

function scan(pattern: string, content: string): Array<{ start: number; end: number }> {
    let regex = compiled.get(pattern);
    if (!regex) {
        try {
            regex = new RegExp(pattern, "gi");
        }
        catch {
            return [];
        }
        compiled.set(pattern, regex);
    }
    regex.lastIndex = 0;
    const out: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        if (match[0].length === 0) {
            regex.lastIndex += 1;
            continue;
        }
        out.push({ start: match.index, end: match.index + match[0].length });
        if (out.length >= 1000)
            break;
    }
    return out;
}

/** Return every sensitive match; this scans the full input, not a window. */
export function redactSensitive(content: string): { text: string; redacted: number } {
    const matches = detect(content);
    if (matches.length === 0)
        return { text: content, redacted: 0 };
    let text = content;
    for (const match of [...matches].sort((a, b) => b.start - a.start))
        text = text.slice(0, match.start) + "[REDACTED]" + text.slice(match.end);
    return { text, redacted: matches.length };
}

export function detect(content: string, extraPatterns: string[] = []): SensitiveMatch[] {
    if (!content)
        return [];
    const rules = [
        ...SENSITIVE_RULES,
        ...extraPatterns.map((pattern, index) => ({
            id: `custom-${index}`,
            category: "provider_key" as const,
            pattern,
            appliesTo: ["egress", "retention", "export"] as SensitiveConsumer[],
        })),
    ];
    const out: SensitiveMatch[] = [];
    for (const rule of rules) {
        for (const hit of scan(rule.pattern, content))
            out.push({ ruleId: rule.id, category: rule.category, ...hit });
    }
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
