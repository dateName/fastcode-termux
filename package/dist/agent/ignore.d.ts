export interface IgnoreRule {
    regex: RegExp;
    negate: boolean;
    dirOnly: boolean;
}
export interface IgnoreMatcher {
    ignored(name: string, fullPath: string, isDir: boolean): boolean;
    isBinary(name: string): boolean;
}
export declare function isBinaryName(name: string): boolean;
export declare function createIgnore(root: string): IgnoreMatcher;
