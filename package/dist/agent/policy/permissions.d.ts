export interface ShellPermissionRules {
    allow?: string[];
    deny?: string[];
}
export interface PermissionPolicy {
    shell?: ShellPermissionRules;
}
export type ShellPermissionDecision = "allow" | "deny" | "none";
/** Global config + trusted project/local .fastcode permission layers. */
export declare function loadPermissionPolicy(cwd?: string): PermissionPolicy;
/** Deny wins over allow; no match means normal guard behavior. */
export declare function evaluateShellPermission(command: string, policy: PermissionPolicy): ShellPermissionDecision;
