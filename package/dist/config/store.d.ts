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
export declare function loadConfig(): any;
export declare function saveConfig(cfg: any): void;
export declare function loadAuth(): {
    keys: any;
};
export declare function saveAuth(store: any): void;
/** Resolve an API key from auth store, then ENV. */
export declare function resolveApiKey(providerId: any, envVars: any): any;
