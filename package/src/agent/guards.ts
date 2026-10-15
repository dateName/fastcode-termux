/**
 * Dangerous-command guard.
 *
 * Ported from HKUDS/FastCode nanobot (nanobot/agent/tools/shell.py): the
 * upstream deny list is kept, with the word-boundary escapes rewritten as
 * character classes so the intent is identical without boundary syntax.
 *
 * Overrides:
 *   FASTCODE_ALLOW_DANGEROUS=1        bypass the deny list (reported in output)
 *   FASTCODE_SHELL_ALLOWLIST=a;b      only commands matching these regexes run
 *   FASTCODE_SHELL_DENY_EXTRA=x;y     extra regexes to deny
 *   FASTCODE_RESTRICT_TO_WORKSPACE=1  also reject ../ and .. escapes
 */
export const DEFAULT_DENY_PATTERNS = [
    "(^|[^a-z])rm +-[rf]{1,2}([^a-z]|$)",
    "(^|[^a-z])del +/[fq]([^a-z]|$)",
    "(^|[^a-z])rmdir +/s([^a-z]|$)",
    "(^|[^a-z-])(format|mkfs|diskpart)([^a-z]|$)",
    "(^|[^a-z])dd +if=",
    "> */dev/sd",
    "(^|[^a-z])(shutdown|reboot|poweroff)([^a-z]|$)",
];
export const FORK_BOMB_MARKERS = [":(){", ":|:&"];
function enabled(name) {
    const value = process.env[name];
    if (value === undefined)
        return false;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
function splitList(value) {
    return (value ?? "").split(/[;,]/).map((entry) => entry.trim()).filter(Boolean);
}
function matches(lower, pattern) {
    try {
        return new RegExp(pattern).test(lower);
    }
    catch {
        return false;
    }
}
/**
 * Decide whether a shell command may run.
 * Returns { allow: true } or { allow: false, output: explanation }.
 */
export function evaluateShellCommand(command) {
    const cmd = String(command ?? "").trim();
    const lower = cmd.toLowerCase();
    if (enabled("FASTCODE_ALLOW_DANGEROUS"))
        return { allow: true, output: undefined, bypassed: true };
    const deny = DEFAULT_DENY_PATTERNS.concat(splitList(process.env["FASTCODE_SHELL_DENY_EXTRA"]));
    for (const pattern of deny) {
        if (matches(lower, pattern)) {
            return {
                allow: false,
                pattern,
                output: "Error: blocked by the safety guard (dangerous pattern: " + pattern + "). " +
                    "Set FASTCODE_ALLOW_DANGEROUS=1 to override.",
            };
        }
    }
    for (const marker of FORK_BOMB_MARKERS) {
        if (lower.includes(marker))
            return { allow: false, output: "Error: blocked by the safety guard (fork bomb pattern)." };
    }
    const allowlist = splitList(process.env["FASTCODE_SHELL_ALLOWLIST"]);
    if (allowlist.length > 0 && !allowlist.some((pattern) => matches(lower, pattern)))
        return { allow: false, output: "Error: blocked by the safety guard (not in FASTCODE_SHELL_ALLOWLIST)." };
    if (enabled("FASTCODE_RESTRICT_TO_WORKSPACE")) {
        const backslash = String.fromCharCode(92);
        if (cmd.includes("../") || cmd.includes(".." + backslash))
            return { allow: false, output: "Error: blocked by the safety guard (path traversal)." };
    }
    return { allow: true, output: undefined };
}
