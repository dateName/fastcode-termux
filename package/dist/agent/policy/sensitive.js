/**
 * Structured sensitive-content detection.
 *
 * Detection is shared by egress, retention and export. It deliberately does
 * not decide how a match is handled; each consumer owns its own policy.
 */
import { DEFAULT_CONTENT_MARKERS } from "./defaults.js";
export const RULESET_VERSION = "1";
const CORE_IDS = [
    "private-key",
    "aws-access-key",
    "github-token",
    "slack-token",
    "google-api-key",
    "openai-key",
];
const CORE_CATEGORIES = [
    "private_key",
    "provider_key",
    "provider_key",
    "provider_key",
    "provider_key",
    "provider_key",
];
export const SENSITIVE_RULES = [
    ...DEFAULT_CONTENT_MARKERS.map((pattern, index) => ({
        id: CORE_IDS[index] ?? `builtin-${index}`,
        category: CORE_CATEGORIES[index] ?? "provider_key",
        pattern,
        appliesTo: ["egress", "retention", "export"],
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
const compiled = new Map();
function scan(pattern, content) {
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
    const out = [];
    let match;
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
export function detect(content, extraPatterns = []) {
    if (!content)
        return [];
    const rules = [
        ...SENSITIVE_RULES,
        ...extraPatterns.map((pattern, index) => ({
            id: `custom-${index}`,
            category: "provider_key",
            pattern,
            appliesTo: ["egress", "retention", "export"],
        })),
    ];
    const out = [];
    for (const rule of rules) {
        for (const hit of scan(rule.pattern, content))
            out.push({ ruleId: rule.id, category: rule.category, ...hit });
    }
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
