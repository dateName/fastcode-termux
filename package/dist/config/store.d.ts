export declare const DEFAULT_CONFIG: {
    providerId: string;
    model: string;
    theme: string;
    agentMode: boolean;
    systemPrompt: string;
    enabledSkills: any[];
    enabledPlugins: any[];
    skillsRegistry: string;
    lifetimeCostUsd: number;
    /**
     * Extra directories the file tools may read and write outside the project
     * root. Relative entries are resolved against the project root; `~/` is
     * expanded against the user's home directory.
     */
    sharedDirs: any[];
    /** Maximum agent tool turns before the loop asks the user to continue. */
    maxAgentTurns: number;
    /** Abort a stream that receives no data for this long (ms). */
    requestIdleTimeoutMs: number;
    /** Approximate character budget before history compaction kicks in. */
    contextBudgetChars: number;
    /** Thinking depth: auto = send nothing, provider default. */
    reasoningEffort: string;
    /** Cached per-provider/model capabilities (native vs pseudo tool calling). */
    capabilities: {
        toolCalling: {};
    };
};
export interface StoredCredential {
    provider: string;
    /** Model the key was originally saved for (display only; keys are provider-wide). */
    model?: string;
    key: string;
    addedAt: string;
}
export interface AuthStore {
    version: number;
    /** Provider-scoped credentials, keyed by provider id. */
    keys: Record<string, StoredCredential>;
    /** Old provider-only keys that could not be migrated (kept for diagnostics). */
    legacy: Record<string, string>;
}
export declare const AUTH_VERSION = 3;
export type KeyLookup = {
    status: "ok";
    key: string;
    source: "file" | "env";
    envVar?: string;
} | {
    status: "unbound";
    provider: string;
    legacyKey: string;
} | {
    status: "missing";
};
export declare function loadConfig(): any;
export declare function saveConfig(cfg: any): void;
/** Composite id used by the legacy v2 format; kept for API compatibility. */
export declare function scopeId(providerId: any, model: any): string;
export declare function loadAuth(): AuthStore;
export declare function saveAuth(store: AuthStore): void;
export declare function getCredential(providerId: any, _model?: any): StoredCredential | undefined;
export declare function listCredentials(): StoredCredential[];
export declare function listLegacy(): Array<{
    provider: string;
    key: string;
}>;
export declare function getLegacy(providerId: any): string | undefined;
/** Save/replace the provider-wide credential (drops any legacy key). */
export declare function setCredential(providerId: any, model: any, key: any): StoredCredential;
export declare function removeCredential(providerId: any, _model?: any): boolean;
/** Remove the provider-wide credential plus any legacy leftovers. */
export declare function removeCredentialsForProvider(providerId: any): number;
/** Turn a key into a safe terminal echo: `sk-****abcd`. */
export declare function maskKey(key: any): string;
/**
 * Resolve the key to use for a provider:
 *   1. the provider-wide credential in auth.json,
 *   2. the provider's environment variable (provider-scoped, any model), and
 *   3. a legacy provider-only key that somehow escaped migration.
 */
export declare function resolveApiKey(providerId: any, _model: any, envVars: any): KeyLookup;
/** Best-effort key for a provider regardless of model (used to list models). */
export declare function resolveProviderKey(providerId: any, envVars: any): {
    key?: string;
    source?: "file" | "env";
    envVar?: string;
};
