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
};
export interface StoredCredential {
    provider: string;
    model: string;
    key: string;
    addedAt: string;
}
export interface AuthStore {
    version: number;
    /** Scoped credentials, keyed by `provider::model`. */
    keys: Record<string, StoredCredential>;
    /** Old provider-only keys we refuse to use until the user re-binds them. */
    legacy: Record<string, string>;
}
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
/** Composite scope id for a provider + model credential. */
export declare function scopeId(providerId: any, model: any): string;
export declare function loadAuth(): AuthStore;
export declare function saveAuth(store: AuthStore): void;
export declare function getCredential(providerId: any, model: any): StoredCredential | undefined;
export declare function listCredentials(): StoredCredential[];
export declare function listLegacy(): Array<{
    provider: string;
    key: string;
}>;
export declare function getLegacy(providerId: any): string | undefined;
/** Save/replace the credential for one provider+model scope (drops the legacy key). */
export declare function setCredential(providerId: any, model: any, key: any): StoredCredential;
export declare function removeCredential(providerId: any, model: any): boolean;
/** Remove every credential for a provider (all models) plus its legacy key. */
export declare function removeCredentialsForProvider(providerId: any): number;
/** Turn a key into a safe terminal echo: `sk-****abcd`. */
export declare function maskKey(key: any): string;
/**
 * Resolve the key to use for a specific provider+model:
 *   1. the scoped credential in auth.json (exact provider+model match), then
 *   2. the provider's environment variable (provider-scoped, any model), and
 *   3. report an "unbound" legacy key instead of using it silently.
 */
export declare function resolveApiKey(providerId: any, model: any, envVars: any): KeyLookup;
/** Best-effort key for a provider regardless of model (used to list models). */
export declare function resolveProviderKey(providerId: any, envVars: any): {
    key?: string;
    source?: "file" | "env";
    envVar?: string;
};
