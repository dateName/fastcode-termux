/**
 * Dangerous-command guard.
 *
 * Blocks destructive shell patterns before execution. Word-boundary escapes
 * are written as character classes so the intent is identical without
 * boundary syntax.
 *
 * Overrides:
 *   FASTCODE_ALLOW_DANGEROUS=1        bypass the deny list (reported in output)
 *   FASTCODE_SHELL_ALLOWLIST=a;b      only commands matching these regexes run
 *   FASTCODE_SHELL_DENY_EXTRA=x;y     extra regexes to deny
 *   FASTCODE_RESTRICT_TO_WORKSPACE=1  also reject ../ and .. escapes
 */
export declare const DEFAULT_DENY_PATTERNS: string[];
export declare const FORK_BOMB_MARKERS: string[];
/**
 * Decide whether a shell command may run.
 * Returns { allow: true } or { allow: false, output: explanation }.
 */
export declare function evaluateShellCommand(command: any): {
    allow: boolean;
    output: any;
    bypassed: boolean;
    pattern?: undefined;
} | {
    allow: boolean;
    pattern: string;
    output: string;
    bypassed?: undefined;
} | {
    allow: boolean;
    output: string;
    bypassed?: undefined;
    pattern?: undefined;
};
