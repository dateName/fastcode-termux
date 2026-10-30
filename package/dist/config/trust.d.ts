export interface TrustPathEntry {
    grantedAt: string;
    lastUsed: string;
}
export interface TrustToolEntry extends TrustPathEntry {
    catalogHash: string;
}
export interface TrustStore {
    version: 1;
    tools: Record<string, TrustToolEntry>;
    paths: Record<string, TrustPathEntry>;
}
export declare function normalizeProjectPath(dir: string): string;
export declare function loadTrust(): TrustStore;
export declare function trustAllEnabled(): boolean;
export declare function isTrusted(dir: string): boolean;
export declare function trustProject(dir: string): string;
export declare function untrustProject(dir: string): boolean;
export declare function listTrusted(): Array<{
    path: string;
    addedAt: string;
}>;
/** Check a tool/fingerprint approval bound to the current tool catalog. */
export declare function isToolApproved(key: string, catalogHash: string): boolean;
export declare function rememberToolApproval(key: string, catalogHash: string): void;
export declare function forgetToolApproval(key: string): boolean;
export declare function listToolApprovals(): Array<{
    key: string;
    grantedAt: string;
    catalogHash: string;
}>;
