export declare const RULESET_VERSION = "1";
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
export declare const SENSITIVE_RULES: SensitiveRule[];
/** Return every sensitive match; this scans the full input, not a window. */
export declare function redactSensitive(content: string): {
    text: string;
    redacted: number;
};
export declare function detect(content: string, extraPatterns?: string[]): SensitiveMatch[];
