import { normalize, resolve } from "node:path";

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
export const READ_ONLY_TOOLS = new Set([
    "pwd", "read_file", "read_many", "list_files", "grep", "stat_path",
]);
const READ_ONLY_COMMANDS = new Set([
    "pwd", "ls", "dir", "cat", "head", "tail", "wc", "stat", "file", "du", "df",
    "grep", "rg", "egrep", "fgrep", "which", "whereis", "where", "whoami", "id",
    "groups", "uname", "date", "uptime", "printenv", "echo", "printf",
    "true", "false", "basename", "dirname", "realpath", "readlink", "tree",
    "more", "less", "jq", "cut", "tr",
]);
const READ_ONLY_PREFIXES = new Set([
    "git status", "git diff", "git log", "git show", "git rev-parse",
    "git ls-files", "git blame", "git grep", "git describe", "git merge-base",
    "git cat-file", "git rev-list", "git shortlog", "git whatchanged",
    "npm ls", "npm list", "npm view", "npm outdated", "npm explain", "npm why",
    "pnpm list", "pnpm ls", "yarn list", "yarn info",
    "cargo tree", "go list", "pip list", "pip show",
    "docker ps", "docker images", "docker logs",
]);
const NON_READ_ONLY_LEADERS = new Set([
    "cd", "sudo", "doas", "env", "xargs", "time", "command", "eval", "exec",
    "source", ".", "sh", "bash", "zsh", "fish", "powershell", "cmd",
]);
function scanCommand(command, onChar) {
    let quote = "";
    let escaped = false;
    for (let i = 0; i < command.length; i += 1) {
        const char = command[i];
        if (escaped) {
            escaped = false;
            onChar(char, i, quote);
            continue;
        }
        if (char === "\\") {
            escaped = true;
            onChar(char, i, quote);
            continue;
        }
        if (quote) {
            if (char === quote)
                quote = "";
            onChar(char, i, quote);
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            onChar(char, i, quote);
            continue;
        }
        onChar(char, i, quote);
    }
    return quote === "";
}
function hasWriteRedirection(command) {
    let found = false;
    const balanced = scanCommand(command, (char, index, quote) => {
        if (quote || char !== ">")
            return;
        const previous = command[index - 1];
        if (previous === "=")
            return;
        found = true;
    });
    return !balanced || found;
}
function hasCommandSubstitution(command) {
    let found = false;
    const balanced = scanCommand(command, (char, index, quote) => {
        if (quote)
            return;
        if (char === "`" || (char === "$" && command[index + 1] === "("))
            found = true;
    });
    return !balanced || found;
}
export function splitCommandSegments(command) {
    const parts = [];
    let current = "";
    let quote = "";
    let escaped = false;
    for (let i = 0; i < command.length; i += 1) {
        const char = command[i];
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\") {
            current += char;
            escaped = true;
            continue;
        }
        if (quote) {
            current += char;
            if (char === quote)
                quote = "";
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        const next = command[i + 1];
        if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
            parts.push(current);
            current = "";
            i += 1;
            continue;
        }
        if (char === ";" || char === "|" || char === "&" || char === "\n") {
            parts.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
}
function isReadOnlySegment(segment) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return true;
    const first = tokens[0].toLowerCase();
    const second = (tokens[1] ?? "").toLowerCase();
    if (NON_READ_ONLY_LEADERS.has(first))
        return false;
    if (READ_ONLY_PREFIXES.has(first + " " + second))
        return true;
    if (READ_ONLY_COMMANDS.has(first))
        return true;
    return false;
}
export function isReadOnlyCommand(command) {
    const cmd = String(command ?? "").trim();
    if (!cmd)
        return false;
    if (hasWriteRedirection(cmd) || hasCommandSubstitution(cmd))
        return false;
    const segments = splitCommandSegments(cmd);
    if (segments.length === 0)
        return false;
    return segments.every(isReadOnlySegment);
}
export function isReadOnlyToolCall(call) {
    const tool = typeof call?.tool === "string" ? call.tool : "";
    if (tool === "shell")
        return isReadOnlyCommand(call.command);
    return READ_ONLY_TOOLS.has(tool);
}
export function loopExemptTools() {
    const raw = process.env["FASTCODE_LOOP_EXEMPT"] ?? "";
    return new Set(raw.split(",").map((entry) => entry.trim()).filter(Boolean));
}
export function isLoopExempt(tool) {
    return loopExemptTools().has(String(tool ?? ""));
}
function stableValue(value) {
    if (value === undefined)
        return "null";
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return "[" + value.map((entry) => stableValue(entry)).join(",") + "]";
    const keys = Object.keys(value).sort().filter((key) => value[key] !== undefined);
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableValue(value[key])).join(",") + "}";
}
export function stableStringify(value) {
    return stableValue(value);
}
function normalizeFingerprintPath(value, cwd) {
    let normalized = normalize(resolve(cwd, value));
    if (normalized.length > 1)
        normalized = normalized.replace(/[\\/]+$/, "");
    return normalized;
}
function fingerprintValue(key, value, cwd) {
    if (typeof value === "string" && (key === "path" || key === "from" || key === "to" || key === "cwd"))
        return normalizeFingerprintPath(value, cwd);
    if (key === "paths" && Array.isArray(value))
        return value.map((entry) => typeof entry === "string" ? normalizeFingerprintPath(entry, cwd) : entry);
    return value;
}
export function toolCallFingerprint(call, cwd = process.cwd()) {
    const tool = typeof call?.tool === "string" ? call.tool : "unknown";
    const args = {};
    for (const key of Object.keys(call ?? {}).sort()) {
        if (key === "tool" || key === "timeoutMs")
            continue;
        args[key] = fingerprintValue(key, call[key], cwd);
    }
    return tool + ":" + stableStringify(args);
}
