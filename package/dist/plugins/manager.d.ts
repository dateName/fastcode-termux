export declare function listInstalledPlugins(cwd?: string): any[];
export declare function getPlugin(name: any, cwd?: string): any;
export declare function importPlugin(source: any, name: any, cwd?: string): {
    name: any;
    description: any;
    path: any;
    body: string;
    skills: any[];
    version: any;
    capabilities: any;
    scope: string;
    unsupported: any;
};
export declare function removePlugin(name: any, cwd?: string): boolean;
export declare function buildPluginsPrompt(enabled: any, cwd?: string): string;
