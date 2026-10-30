export interface ShellAstHard {
    code: string;
    target: string;
    reason: string;
    alternatives: string[];
}
export interface ShellAstAnalysis {
    derived: string[];
    hard?: ShellAstHard;
}
export declare function analyzeShellAst(command: string): ShellAstAnalysis;
