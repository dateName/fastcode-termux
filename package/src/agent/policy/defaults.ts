/**
 * Lightweight egress defaults. Kept separate from the policy engine so
 * config/store can include the default object without loading guards.
 */
export type EgressMode = "off" | "audit" | "block";

export interface EgressConfig {
    enabled: boolean;
    mode: EgressMode;
    denyPaths: string[];
    denyGlobs: string[];
    denyContentMarkers: string[];
    maxScanBytes: number;
    scanToolOutput: boolean;
}

export const DEFAULT_CONTENT_MARKERS = [
    "-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "AKIA[0-9A-Z]{16}",
    "gh[pousr]_[A-Za-z0-9]{36,}",
    "xox[baprs]-[A-Za-z0-9-]{10,}",
    "AIza[0-9A-Za-z_-]{35}",
    "sk-[A-Za-z0-9]{32,}",
];

export const DEFAULT_EGRESS_CONFIG: EgressConfig = {
    enabled: false,
    mode: "audit",
    denyPaths: [],
    denyGlobs: [],
    denyContentMarkers: [...DEFAULT_CONTENT_MARKERS],
    maxScanBytes: 1_000_000,
    scanToolOutput: true,
};
