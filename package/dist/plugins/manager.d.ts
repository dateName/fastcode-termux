export declare function listInstalledPlugins(): {
    name: any;
    description: any;
    path: any;
    body: string;
    skills: any[];
}[];
export declare function getPlugin(name: any): {
    name: any;
    description: any;
    path: any;
    body: string;
    skills: any[];
};
export declare function importPlugin(source: any, name: any): {
    name: any;
    description: any;
    path: any;
    body: string;
    skills: any[];
};
export declare function removePlugin(name: any): boolean;
export declare function buildPluginsPrompt(enabled: any): string;
