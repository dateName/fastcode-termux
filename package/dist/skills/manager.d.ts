/** List skills currently installed under ~/.fastcode/skills. */
export declare function listInstalledSkills(): any[];
/** Look up a skill by name (matches folder name OR frontmatter name). */
export declare function getSkill(name: any): any;
/** Install a skill. Returns the parsed manifest on success. */
export declare function installSkill(spec: any, opts?: any): Promise<{
    name: any;
    description: any;
    source: any;
    path: string;
    body: any;
}>;
/** Remove an installed skill by name or folder. */
export declare function uninstallSkill(name: any): boolean;
/** Search the registry for skills matching a query. */
export declare function searchRegistry(query: any, registry?: string): Promise<any>;
/** Compose the system-prompt addendum for a list of enabled skill names. */
export declare function buildSkillsPrompt(enabled: any): string;
