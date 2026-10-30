import { normalize, resolve } from "node:path";
import { analyzeShellAst } from "./shell-ast.js";
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
    const destructive = classifyDestructiveCommand(cmd);
    if (destructive?.kind === "hard") {
        return {
            allow: false,
            action: "hard_block",
            code: destructive.code,
            target: destructive.target,
            reason: destructive.reason,
            alternatives: destructive.alternatives,
            output: formatHardBlock(destructive),
        };
    }
    const ast = astHardUpgrade(cmd);
    if (ast) {
        return {
            allow: false,
            action: "hard_block",
            code: ast.code,
            target: ast.target,
            reason: ast.reason,
            alternatives: ast.alternatives,
            output: formatHardBlock(ast),
        };
    }
    const soft = destructive?.kind === "soft" ? destructive : legacySoftMatch(cmd);
    if (soft) {
        if (enabled("FASTCODE_ALLOW_DANGEROUS")) {
            return {
                allow: true,
                action: "allow",
                code: "soft_gate_bypassed",
                target: soft.target,
                output: "Soft gate bypassed by FASTCODE_ALLOW_DANGEROUS=1.",
                bypassed: true,
            };
        }
        return {
            allow: false,
            action: "soft_gate",
            code: soft.code,
            target: soft.target,
            reason: soft.reason,
            alternatives: soft.alternatives,
            output: formatSoftGate(soft),
            ...(soft.code === "legacy_dangerous_pattern" ? { pattern: soft.target } : {}),
        };
    }
    return { allow: true, action: "allow", code: "allowed", output: undefined };
}
export const READ_ONLY_TOOLS = new Set([
    "pwd", "read_file", "read_many", "list_files", "grep", "stat_path",
]);
const READ_ONLY_COMMANDS = new Set([
    "pwd", "ls", "dir", "cat", "head", "tail", "wc", "stat", "file", "du", "df",
    "grep", "rg", "egrep", "fgrep", "which", "whereis", "where", "whoami", "id",
    "groups", "uname", "date", "uptime", "echo", "printf",
    "true", "false", "basename", "dirname", "realpath", "readlink", "tree",
    "more", "less", "jq", "cut", "tr",
]);
const COMMAND_WRAPPERS = new Set(["sudo", "doas", "command", "exec", "nohup", "nice", "stdbuf", "time", "timeout", "xargs"]);
const SHELL_COMMANDS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
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
function baseCommandName(token) {
    const cleaned = token.replace(/^[()'"`]+|[()'"`]+$/g, "");
    const parts = cleaned.split(/[\\/]/);
    return (parts[parts.length - 1] ?? cleaned).toLowerCase();
}
function rawCommandName(token) {
    const cleaned = stripShellToken(token).replace(/^\\+/, "").replace(/['"]/g, "");
    return baseCommandName(cleaned);
}
const SENSITIVE_VAR_RE = /(?:key|token|secret|passw|auth|credential|private)/i;
const EXFIL_SINK_RE = /\b(?:curl|wget|nc|ncat|netcat|socat|ssh|scp|rsync|tee|logger|mail|sendmail)\b/i;
const CREDENTIAL_DUMP_RE = /(?:^|[;&|(]\s*)(?:sudo\s+|xargs(?:\s+-\S+)*\s+)?(printenv|env)\b/g;
/**
 * OQ-06: bare `printenv` / `env` is a Soft Gate (output can be reviewed).
 * Targeted sensitive names, grep for sensitive words, and piping/redirecting
 * the dump to an external sink are Hard Block.
 */
function credentialDumpMatch(command) {
    for (const match of command.matchAll(CREDENTIAL_DUMP_RE)) {
        const name = (match[1] ?? "").toLowerCase();
        const start = (match.index ?? 0) + match[0].length;
        let rest = command.slice(start);
        const stop = rest.search(/;|&&|\|\||\n/);
        if (stop >= 0)
            rest = rest.slice(0, stop);
        rest = rest.replace(/[)\]}]+$/, "").trim();
        const pipe = rest.indexOf("|");
        const beforePipe = pipe >= 0 ? rest.slice(0, pipe) : rest;
        const afterPipe = pipe >= 0 ? rest.slice(pipe + 1).trim() : "";
        const args = beforePipe.trim().split(/\s+/).filter(Boolean);
        if (afterPipe) {
            if (/\bgrep\b/i.test(afterPipe) && SENSITIVE_VAR_RE.test(afterPipe)) {
                return hardMatch("credential_dump_targeted", `${name} | grep`, "targeted-secret-search", [
                    "Do not grep environment output for secret-like names.",
                ]);
            }
            if (EXFIL_SINK_RE.test(afterPipe)) {
                return hardMatch("credential_exfil", `${name} | ${afterPipe.split(/\s+/)[0] ?? ""}`, "environment-output-to-external-sink", [
                    "Do not pipe environment output into a network/file/log sink.",
                ]);
            }
        }
        if (/(?:^|\s)>{1,2}\s*(?!\/dev\/null)\S+/.test(beforePipe)) {
            return hardMatch("credential_exfil", `${name} > file`, "environment-output-to-file", [
                "Do not write environment output to a file; review named non-secret variables instead.",
            ]);
        }
        if (name === "printenv") {
            const variables = args.filter((arg) => !arg.startsWith("-"));
            if (variables.some((value) => SENSITIVE_VAR_RE.test(value))) {
                return hardMatch("credential_dump_targeted", variables.join(" "), "targeted-secret-variable", [
                    "Do not print secret-like environment variables.",
                ]);
            }
            if (variables.length > 0)
                continue;
        }
        else {
            // `env VAR=value command` is a wrapper, not a dump. The inner
            // command still goes through the normal classifier/AST path.
            const commandIndex = args.findIndex((arg) => !arg.startsWith("-") && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg));
            if (commandIndex >= 0)
                continue;
        }
        return softMatch("credential_dump", name, "environment-dump");
    }
    return undefined;
}
const REMOTE_SHELL_PIPE_RE = /(?:\bcurl\b|\bwget\b)[\s\S]*?\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|fish|ksh)\b/i;
const BASE64_SHELL_PIPE_RE = /\bbase64\b[\s\S]*?(?:-d|--decode)[\s\S]*?\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|fish|ksh)\b/i;
const PROCESS_SUBSTITUTION_SHELL_RE = /(?:sh|bash|zsh|dash|fish|ksh)\s+<\(\s*(?:curl|wget)\b/i;
const EVAL_FETCH_RE = /(?:eval|source|\.)\s+\$\(\s*(?:curl|wget)\b/i;
const COMMAND_SUBSTITUTION_FETCH_RE = /\$\(\s*(?:curl|wget)\b/i;
const BLOCK_DEVICE_RE = /^\/dev\/(?:sd|hd|nvme|mmcblk|disk|rdisk)/i;
const SOURCE_DIR_NAMES = new Set(["src", "lib", "app", "apps", "packages", "package", "pkg", "server", "client", ".git"]);
const SYSTEM_PATH_PREFIXES = ["/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64", "/boot", "/var", "/opt", "/root", "/home", "/srv", "/proc", "/sys"];
const SHELL_GRAMMAR_TOKENS = new Set(["{", "}", "(", ")", "!", "if", "then", "else", "elif", "fi", "for", "do", "done", "while", "until", "case", "esac", "function"]);
function formatHardBlock(match) {
    const alternatives = match.alternatives.length > 0 ? `\nSafe alternatives: ${match.alternatives.join("; ")}` : "";
    return `[guardrails] HARD_BLOCK action=${match.code} target=${JSON.stringify(match.target)} reason=${match.reason}\n` +
        "This hard block cannot be overridden by FASTCODE_ALLOW_DANGEROUS, trust, session/always approval, or configuration." +
        alternatives;
}
function formatSoftGate(match) {
    return `[guardrails] SOFT_GATE action=${match.code} target=${JSON.stringify(match.target)} reason=${match.reason}\n` +
        "Approval is required; no approval resolver is wired in this batch, so the command is denied (fail closed).";
}
function redirectTargets(command) {
    const targets = [];
    let quote = "";
    let escaped = false;
    for (let i = 0; i < command.length; i += 1) {
        const char = command[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote)
                quote = "";
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char !== ">")
            continue;
        if (command[i + 1] === ">") {
            i += 1;
            continue;
        }
        let cursor = i + 1;
        while (/\s/.test(command[cursor] ?? ""))
            cursor += 1;
        if (!command[cursor])
            continue;
        let target = "";
        const targetQuote = command[cursor];
        if (targetQuote === '"' || targetQuote === "'") {
            cursor += 1;
            while (cursor < command.length && command[cursor] !== targetQuote) {
                if (command[cursor] === "\\" && targetQuote === '"' && cursor + 1 < command.length) {
                    target += command[cursor + 1];
                    cursor += 2;
                    continue;
                }
                target += command[cursor];
                cursor += 1;
            }
            i = cursor;
        }
        else {
            while (cursor < command.length && !/[\s;&|]/.test(command[cursor])) {
                target += command[cursor];
                cursor += 1;
            }
            i = cursor - 1;
        }
        if (target)
            targets.push(target);
    }
    return targets;
}
function unquotedForLegacy(command) {
    let out = "";
    let quote = "";
    let escaped = false;
    for (const char of command) {
        if (escaped) {
            escaped = false;
            out += quote ? " " : char;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            out += quote ? " " : char;
            continue;
        }
        if (quote) {
            if (char === quote)
                quote = "";
            out += " ";
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            out += " ";
            continue;
        }
        out += char;
    }
    return out;
}
/**
 * Fold the historical "ordinary deny" patterns into Soft Gate. They are
 * heuristics, not non-overridable Hard Blocks; keeping a fourth state made the
 * FASTCODE_ALLOW_DANGEROUS semantics ambiguous.
 */
function legacySoftMatch(command) {
    const scan = unquotedForLegacy(command).toLowerCase();
    const deny = DEFAULT_DENY_PATTERNS.concat(splitList(process.env["FASTCODE_SHELL_DENY_EXTRA"]));
    for (const pattern of deny) {
        if (matches(scan, pattern))
            return { kind: "soft", code: "legacy_dangerous_pattern", target: pattern, reason: "legacy-deny", alternatives: [] };
    }
    const allowlist = splitList(process.env["FASTCODE_SHELL_ALLOWLIST"]);
    if (allowlist.length > 0 && !allowlist.some((pattern) => matches(scan, pattern)))
        return { kind: "soft", code: "allowlist", target: "FASTCODE_SHELL_ALLOWLIST", reason: "not-allowlisted", alternatives: [] };
    if (enabled("FASTCODE_RESTRICT_TO_WORKSPACE")) {
        const backslash = String.fromCharCode(92);
        if (command.includes("../") || command.includes(".." + backslash))
            return { kind: "soft", code: "path_traversal", target: "..", reason: "workspace-escape", alternatives: [] };
    }
    return undefined;
}
function hardMatch(code, target, reason, alternatives) {
    return { kind: "hard", code, target, reason, alternatives };
}
/**
 * AST is a second opinion, never a replacement. It may only return a Hard
 * Block upgrade; parse failures or soft findings are ignored so the shape
 * matcher's result is never downgraded.
 */
function astHardUpgrade(command, depth = 0, visited = new Set()) {
    if (depth > 4 || visited.has(command))
        return undefined;
    visited.add(command);
    const analysis = analyzeShellAst(command);
    if (analysis.hard)
        return hardMatch(analysis.hard.code, analysis.hard.target, analysis.hard.reason, analysis.hard.alternatives);
    for (const derived of analysis.derived) {
        if (derived === command)
            continue;
        const shape = classifyDestructiveCommand(derived);
        if (shape?.kind === "hard")
            return shape;
        const nested = astHardUpgrade(derived, depth + 1, visited);
        if (nested)
            return nested;
    }
    return undefined;
}
function softMatch(code, target, reason) {
    return { kind: "soft", code, target, reason, alternatives: [] };
}
function stripShellToken(value) {
    let token = String(value ?? "").trim();
    for (const quote of ['"', "'", "`"]) {
        if (token.length >= 2 && token.startsWith(quote) && token.endsWith(quote)) {
            token = token.slice(1, -1);
            break;
        }
    }
    return token.replace(/^[()]+|[()]+$/g, "");
}
function commandIndex(tokens) {
    for (let i = 0; i < tokens.length; i += 1) {
        const token = stripShellToken(tokens[i]);
        if (!token)
            continue;
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token))
            continue;
        const name = rawCommandName(token);
        if (SHELL_GRAMMAR_TOKENS.has(name))
            continue;
        if (name === "sudo" || name === "doas") {
            i += 1;
            while (i < tokens.length && tokens[i].startsWith("-")) {
                const option = stripShellToken(tokens[i]);
                i += 1;
                if (/^-(u|g|p|C|U|h)$/.test(option) && i < tokens.length)
                    i += 1;
            }
            i -= 1;
            continue;
        }
        if (name === "timeout") {
            i += 1;
            while (i < tokens.length && (tokens[i].startsWith("-") || /^\d+(?:\.\d+)?[smhd]?$/.test(tokens[i])))
                i += 1;
            i -= 1;
            continue;
        }
        if (COMMAND_WRAPPERS.has(name) || token.startsWith("-") || /^\d+(?:\.\d+)?[smhd]?$/.test(token))
            continue;
        return i;
    }
    return -1;
}
function parseRmArgs(args) {
    let recursive = false;
    let literal = false;
    const targets = [];
    for (const raw of args) {
        const arg = stripShellToken(raw);
        if (!literal && arg === "--") {
            literal = true;
            continue;
        }
        if (!literal && arg.startsWith("--")) {
            if (arg === "--recursive")
                recursive = true;
            continue;
        }
        if (!literal && /^-[A-Za-z]+$/.test(arg)) {
            if (/[rR]/.test(arg.slice(1)))
                recursive = true;
            continue;
        }
        if (arg)
            targets.push(arg);
    }
    return { recursive, targets };
}
function isDotEnvTarget(target) {
    const base = stripShellToken(target).replace(/\\/g, "/").split("/").pop() ?? "";
    return base.toLowerCase() === ".env";
}
function isSensitiveTarget(target) {
    const clean = stripShellToken(target).replace(/\\/g, "/").replace(/\/+$/, "");
    const base = (clean.split("/").pop() ?? "").toLowerCase();
    return base === "auth.json" || base === "sessions" || clean.includes("/sessions/") ||
        base.endsWith(".pem") || base.endsWith(".key");
}
function isSystemPath(target) {
    const clean = stripShellToken(target).replace(/\\/g, "/").replace(/\/+$/, "");
    return SYSTEM_PATH_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(prefix + "/"));
}
function hasWildcardTarget(target) {
    return /[*?\[]/.test(stripShellToken(target));
}
function dangerousDeleteReason(target) {
    const cleaned = stripShellToken(target).replace(/\\/g, "/");
    const noTrail = cleaned.length > 1 ? cleaned.replace(/\/+$/, "") : cleaned;
    const lower = noTrail.toLowerCase();
    if (/^\/+$/.test(cleaned))
        return "root";
    if (lower === ".")
        return "current-directory";
    if (lower === "..")
        return "parent-directory";
    if (lower === "~" || lower === "$home" || lower === "${home}" || lower === "%userprofile%")
        return "home";
    if (lower === "/*" || lower === "/." || lower === "/..")
        return "root";
    if (/^\$[a-z_{(]/i.test(cleaned) || /^\$\(/.test(cleaned) || /^%[a-z_]+%$/i.test(cleaned) || /^\$env:/i.test(cleaned))
        return "variable-target";
    if (noTrail === "{}" || noTrail === "$@" || noTrail === "$*")
        return "variable-target";
    if (/^[a-z]:$/i.test(noTrail))
        return "drive-root";
    const home = (process.env["HOME"] || process.env["USERPROFILE"] || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (home && noTrail.toLowerCase() === home.toLowerCase())
        return "home";
    if (isSystemPath(noTrail))
        return "system-path";
    return undefined;
}
function isSourceDirectory(target) {
    const base = stripShellToken(target).replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
    const lower = base.toLowerCase();
    if (SOURCE_DIR_NAMES.has(lower))
        return true;
    return /(?:^|[._-])(?:src|lib|app|apps|packages?|pkg|server|client)(?=$|[._-]|\d)/.test(lower);
}
function classifySegment(name, args, segment) {
    if (name === "rm") {
        const { recursive, targets } = parseRmArgs(args);
        if (targets.length === 0)
            return undefined;
        // .env delete is recoverable (rebuild from .env.example / secret
        // manager), so it is a Soft Gate; truncation/redirect is Hard below.
        const dotenvTargets = targets.filter(isDotEnvTarget);
        const classified = targets.filter((target) => !isDotEnvTarget(target));
        if (classified.length === 0) {
            if (dotenvTargets.length > 0)
                return softMatch("delete_dotenv", dotenvTargets[0], "dotenv-delete");
            return undefined;
        }
        for (const target of classified) {
            if (isSensitiveTarget(target)) {
                return hardMatch("delete_sensitive", stripShellToken(target), "protected-credential-or-session-file", [
                    "Move the credential/session file to a secure backup without printing its contents.",
                    "Rotate the credential if it may already be exposed.",
                ]);
            }
            if (recursive && hasWildcardTarget(target)) {
                return hardMatch("delete_wildcard", stripShellToken(target), "wildcard-recursive-delete", [
                    "List the matches and delete reviewed explicit paths instead of a glob.",
                ]);
            }
            if (recursive) {
                const reason = dangerousDeleteReason(target);
                if (reason) {
                    return hardMatch("delete_all", stripShellToken(target), reason, [
                        "Use a narrower explicit path.",
                        "Move the target to a reviewed backup instead of deleting it recursively.",
                    ]);
                }
                if (isSourceDirectory(target)) {
                    return hardMatch("delete_source_tree", stripShellToken(target), "source-directory-recursive", [
                        "Delete individual generated files instead of a source directory.",
                        "Use a reviewed backup or version control to recover the directory.",
                    ]);
                }
            }
        }
        return softMatch(recursive ? "delete_recursive" : "delete_file", classified[0], recursive ? "recursive-delete" : "file-delete");
    }
    if (name === "find" && args.some((arg) => stripShellToken(arg) === "-delete")) {
        const target = args.map(stripShellToken).find((arg) => arg && !arg.startsWith("-")) ?? ".";
        return hardMatch("find_delete", target, "find-delete", [
            "List the matches first, then delete only reviewed explicit paths.",
        ]);
    }
    if (name === "git") {
        const sub = stripShellToken(args[0] ?? "").toLowerCase();
        if (sub === "reset" && args.some((arg) => stripShellToken(arg) === "--hard")) {
            const hardIndex = args.findIndex((arg) => stripShellToken(arg) === "--hard");
            const target = args.slice(hardIndex + 1).map(stripShellToken).find((arg) => arg && !arg.startsWith("-")) ?? "";
            return softMatch("git_reset_hard", target || "HEAD", "working-tree-reset");
        }
        if (sub === "push") {
            const force = args.some((arg) => {
                const value = stripShellToken(arg);
                return value === "-f" || value === "--force" || value.startsWith("--force-with-lease");
            });
            if (!force)
                return undefined;
            const positional = args.map(stripShellToken).filter((arg) => arg && !arg.startsWith("-"));
            const protectedBranch = positional.find((arg) => /\b(?:main|master|prod)\b/i.test(arg));
            if (protectedBranch)
                return hardMatch("git_push_force_protected", protectedBranch, "protected-branch-force-push", [
                    "Push a feature branch and open a reviewed merge instead.",
                    "Use a normal, non-force push after reconciling the remote branch.",
                ]);
            if (positional.length >= 2)
                return softMatch("git_push_force", positional.join(" "), "force-push");
            return hardMatch("git_push_force_unknown", positional[0] ?? "current-branch", "force-push-without-explicit-branch", [
                "Name the remote and target branch explicitly.",
                "Push a feature branch instead of the current/protected branch.",
            ]);
        }
        if (sub === "clean") {
            const flags = args.map(stripShellToken).filter((arg) => arg.startsWith("-")).join(" ");
            if (/(^|\s)-[a-z]*x[a-z]*\b/i.test(flags)) {
                return hardMatch("git_clean_dirs", flags || "-fdx", "clean-untracked-and-ignored", [
                    "Run `git clean -n` and review the list first.",
                    "Delete only explicit generated paths.",
                ]);
            }
            if (/(^|\s)-[a-z]*[df][a-z]*\b/i.test(flags) || /--directories|--force/i.test(flags))
                return softMatch("git_clean_files", flags || "-f", "clean-untracked-files");
        }
    }
    if (name === "dd") {
        const of = args.map(stripShellToken).find((arg) => /^of=/i.test(arg));
        if (!of)
            return undefined;
        const target = of.slice(3);
        if (/^\/(?:dev|proc|sys)\//i.test(target)) {
            return hardMatch("dd_block_device", target, "block-device-write", [
                "Never write raw images to a block device from the agent.",
                "Verify the device path and ask the user to run the write manually.",
            ]);
        }
        return softMatch("dd_write", target, "raw-write");
    }
    if (name.startsWith("mkfs") || name.startsWith("mke2fs") || name === "fdisk" || name === "diskpart" || name === "format") {
        return hardMatch("disk_format", name, "disk-format-or-partition", [
            "Ask the user to partition/format the device manually.",
        ]);
    }
    if (name === "nc" || name === "ncat" || name === "netcat" || name === "socat") {
        const values = args.map(stripShellToken);
        if (values.some((arg) => arg === "-e" || arg === "-c" || arg === "--exec" || arg === "--command" ||
            /^exec:/i.test(arg))) {
            return hardMatch("reverse_shell", name, "reverse-shell-entry", [
                "Do not start network shells from the agent.",
            ]);
        }
    }
    if (name === "shutdown" || name === "reboot" || name === "poweroff" || name === "halt") {
        return hardMatch("system_power", name, "system-shutdown", [
            "Ask the user to power off or reboot explicitly.",
        ]);
    }
    if (name === "systemctl") {
        const action = stripShellToken(args[0] ?? "").toLowerCase();
        if (action === "stop" || action === "disable" || action === "mask") {
            return hardMatch("system_service_stop", args.map(stripShellToken).join(" "), "system-service-stop", [
                "Ask the user to stop/disable the service manually.",
            ]);
        }
    }
    if (name === "docker") {
        const sub = stripShellToken(args[0] ?? "").toLowerCase();
        const values = args.map(stripShellToken);
        if (sub === "container" && values.includes("prune") &&
            values.some((arg) => arg === "-f" || arg === "--force")) {
            return hardMatch("docker_prune_all", "container prune", "delete-stopped-containers", [
                "List containers and remove only reviewed ids explicitly.",
            ]);
        }
        if (sub === "system" && values.includes("prune") &&
            values.some((arg) => arg === "--all" || (arg.startsWith("-") && !arg.startsWith("--") && arg.includes("a"))) &&
            values.includes("--volumes")) {
            return hardMatch("docker_prune_all", "system prune -a --volumes", "delete-all-containers-and-volumes", [
                "Prune one reviewed resource type at a time.",
            ]);
        }
        if (sub === "rm" && values.includes("-f") && (segment.includes("$(") || values.includes("--all"))) {
            return hardMatch("docker_rm_all", "docker rm -f", "delete-all-containers", [
                "List containers and remove only the reviewed ids explicitly.",
            ]);
        }
    }
    if (name === "kubectl") {
        const sub = stripShellToken(args[0] ?? "").toLowerCase();
        const target = stripShellToken(args[1] ?? "").toLowerCase();
        if (sub === "delete" && (target === "ns" || target === "namespace")) {
            return softMatch("kubectl_delete_namespace", args.map(stripShellToken).join(" "), "delete-namespace");
        }
        if (sub === "scale" && args.some((arg) => /--replicas=0\b/i.test(stripShellToken(arg)))) {
            return softMatch("kubectl_scale_zero", args.map(stripShellToken).join(" "), "scale-deployment-to-zero");
        }
        if (sub === "delete" && args.some((arg) => stripShellToken(arg) === "--all") &&
            args.some((arg) => /^(?:ns|namespace|namespaces)$/i.test(stripShellToken(arg)))) {
            return hardMatch("kubectl_delete_namespace", args.map(stripShellToken).join(" "), "delete-all-namespaces", [
                "Delete individual reviewed resources instead of using --all.",
            ]);
        }
    }
    if (name === "chmod" || name === "chown" || name === "chgrp") {
        const values = args.map(stripShellToken);
        const recursive = values.some((arg) => arg === "-R" || arg === "--recursive");
        const mode = values.find((arg) => /^[0-7]{3,4}$/.test(arg));
        const target = values.find((arg) => !arg.startsWith("-") && (arg === "/" || arg.startsWith("/*") || isSystemPath(arg)));
        if (recursive && target && (name !== "chmod" || mode === "777" || argIsRootLike(target))) {
            return hardMatch(name === "chmod" ? "chmod_root_recursive" : "chown_system_recursive", target, "system-permission-change", [
                "Change permissions/ownership only on reviewed explicit paths.",
            ]);
        }
    }
    if (name === "truncate") {
        const values = args.map(stripShellToken);
        const zero = values.some((arg, index) => (arg === "-s" || arg === "--size") && values[index + 1] === "0") ||
            values.some((arg) => /^--size=0$/i.test(arg));
        const targets = values.filter((arg) => arg && !arg.startsWith("-") && arg !== "0");
        const sensitive = targets.find((target) => isSensitiveTarget(target) || isDotEnvTarget(target));
        if (zero && sensitive) {
            return hardMatch("truncate_sensitive", sensitive, isDotEnvTarget(sensitive) ? "truncate-dotenv" : "empty-protected-file", [
                "Move the credential/session file to a secure backup instead of emptying it.",
            ]);
        }
        if (targets.length > 0)
            return softMatch("truncate_file", targets[0], "empty-file");
    }
    if (name === "unlink" || name === "shred") {
        const targets = args.map(stripShellToken).filter((arg) => arg && !arg.startsWith("-"));
        const sensitive = targets.find(isSensitiveTarget);
        if (sensitive) {
            return hardMatch("delete_sensitive", sensitive, "protected-credential-or-session-file", [
                "Move the credential/session file to a secure backup without printing its contents.",
            ]);
        }
        const dotenv = targets.find(isDotEnvTarget);
        if (name === "shred" && dotenv) {
            return hardMatch("truncate_sensitive", dotenv, "shred-dotenv", [
                "Never shred .env; move it to a secure backup instead.",
            ]);
        }
        if (dotenv)
            return softMatch("delete_dotenv", dotenv, "dotenv-delete");
        if (targets.length > 0)
            return softMatch("delete_file", targets[0], "file-delete");
    }
    if (name === "del" || name === "erase" || name === "rd" || name === "rmdir") {
        const values = args.map(stripShellToken);
        const targets = values.filter((arg) => arg && !arg.startsWith("/") && !arg.startsWith("-"));
        const sensitive = targets.find(isSensitiveTarget);
        if (sensitive) {
            return hardMatch("delete_sensitive", sensitive, "protected-credential-or-session-file", [
                "Move the credential/session file to a secure backup without printing its contents.",
            ]);
        }
        const dotenv = targets.find(isDotEnvTarget);
        const classified = targets.filter((target) => !isDotEnvTarget(target));
        const recursive = values.some((arg) => /^\/[a-z]*s/i.test(arg) || /^--recursive$/i.test(arg));
        if (recursive && classified.length > 0) {
            return hardMatch("delete_all", classified[0], "windows-recursive-delete", [
                "Delete reviewed explicit files/directories instead of recursive Windows delete.",
            ]);
        }
        if (dotenv)
            return softMatch("delete_dotenv", dotenv, "dotenv-delete");
        if (classified.length > 0)
            return softMatch("delete_file", classified[0], "file-delete");
    }
    if (name === "mv" || name === "move") {
        const values = args.map(stripShellToken).filter((arg) => arg && !arg.startsWith("-"));
        if (values.length > 0 && isDotEnvTarget(values[0]))
            return softMatch("move_dotenv", values[0], "dotenv-move");
    }
    if ((name === "cp" || name === "install" || name === "mv") && args.some((arg) => stripShellToken(arg) === "/dev/null")) {
        const targets = args.map(stripShellToken).filter((arg) => arg && !arg.startsWith("-") && arg !== "/dev/null");
        const sensitive = targets.find((target) => isSensitiveTarget(target) || isDotEnvTarget(target));
        if (sensitive) {
            return hardMatch("truncate_sensitive", sensitive, isDotEnvTarget(sensitive) ? "truncate-dotenv" : "truncate-with-dev-null", [
                "Move the credential/session file to a secure backup instead of truncating it.",
            ]);
        }
    }
    return undefined;
}
function argIsRootLike(target) {
    const clean = stripShellToken(target).replace(/\\/g, "/");
    return /^\/+$/.test(clean) || clean === "/" || isSystemPath(clean);
}
function classifyDestructiveCommand(command, depth = 0) {
    const raw = String(command ?? "");
    const scan = unquotedForLegacy(raw);
    const credential = credentialDumpMatch(raw);
    if (credential?.kind === "hard")
        return credential;
    if (REMOTE_SHELL_PIPE_RE.test(scan) || BASE64_SHELL_PIPE_RE.test(scan) ||
        PROCESS_SUBSTITUTION_SHELL_RE.test(scan) || EVAL_FETCH_RE.test(raw) ||
        COMMAND_SUBSTITUTION_FETCH_RE.test(raw)) {
        return hardMatch("remote_code_pipe", "piped-to-shell", "download-or-decoded-code-execution", [
            "Download the script, review it, then run it explicitly.",
        ]);
    }
    if (FORK_BOMB_MARKERS.some((marker) => raw.includes(marker))) {
        return hardMatch("fork_bomb", "fork-bomb", "resource-exhaustion", [
            "Do not run self-replicating shell functions.",
        ]);
    }
    if (/\/dev\/(?:tcp|udp)\//i.test(scan)) {
        return hardMatch("reverse_shell", "/dev/tcp", "network-socket-redirect", [
            "Do not open network sockets from the shell.",
        ]);
    }
    for (const rawTarget of redirectTargets(raw)) {
        const target = stripShellToken(rawTarget);
        if (BLOCK_DEVICE_RE.test(target)) {
            return hardMatch("write_block_device", target, "redirect-to-block-device", [
                "Never redirect output to a block device from the agent.",
            ]);
        }
        if (target && (isSensitiveTarget(target) || isDotEnvTarget(target) || isSystemPath(target))) {
            return hardMatch("truncate_sensitive", target, isDotEnvTarget(target) ? "overwrite-dotenv" : "redirect-over-protected-file", [
                "Move the credential/session file to a secure backup instead of overwriting it.",
            ]);
        }
    }
    let soft = credential?.kind === "soft" ? credential : undefined;
    for (const segment of splitCommandSegments(raw)) {
        const tokens = segment.split(/\s+/).filter(Boolean);
        if (tokens.length === 0)
            continue;
        const index = commandIndex(tokens);
        if (index < 0)
            continue;
        const name = rawCommandName(tokens[index]);
        const args = tokens.slice(index + 1);
        if (SHELL_COMMANDS.has(name) || name === "eval") {
            let inner = "";
            if (name === "eval")
                inner = args.join(" ");
            else {
                const cIndex = args.findIndex((arg) => /^-[a-z]*c$/i.test(stripShellToken(arg)));
                if (cIndex >= 0)
                    inner = args.slice(cIndex + 1).join(" ");
            }
            if (inner && depth < 4) {
                const nested = classifyDestructiveCommand(stripShellToken(inner), depth + 1);
                if (nested?.kind === "hard")
                    return nested;
                if (nested?.kind === "soft" && !soft)
                    soft = nested;
            }
            continue;
        }
        const match = classifySegment(name, args, segment);
        if (match?.kind === "hard")
            return match;
        if (match?.kind === "soft" && !soft)
            soft = match;
    }
    return soft;
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
