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
export declare const DEFAULT_CONTENT_MARKERS: string[];
export declare const DEFAULT_EGRESS_CONFIG: EgressConfig;
