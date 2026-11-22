export interface WorktreeInfo {
    path: string;
    head?: string;
    branch?: string;
    detached?: boolean;
    bare?: boolean;
}
export declare function worktreeRootFor(cwd: string): string;
export declare function listWorktrees(cwd: string): WorktreeInfo[];
export declare function createWorktree(cwd: string, slug: string): {
    path: string;
    branch: string;
};
export declare function worktreeDiff(path: string): {
    status: string;
    diff: string;
};
export declare function applyWorktree(cwd: string, path: string, options?: {
    commit?: boolean;
}): {
    applied: boolean;
    output: string;
};
export declare function removeWorktree(cwd: string, path: string, force?: boolean): void;
