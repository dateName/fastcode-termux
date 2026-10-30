/**
 * Limited bash AST second opinion for Guardrails.
 *
 * This is deliberately not a replacement for the shape matcher. It only
 * extracts the three entry classes we can safely re-feed into the existing
 * classifier:
 *
 *   1. shell `-c` literal strings
 *   2. `find ... -exec ... ;/+`
 *   3. eval / source / `.` literal command strings
 *
 * plus one same-scope assignment (`X=rm; $X -rf /`). It only reports Hard
 * Block upgrades; parse failures return no findings so the shape matcher's
 * result is never downgraded.
 */
import parse from "bash-parser";
const MAX_DEPTH = 4;
export function analyzeShellAst(command) {
    return analyze(command, 0);
}
function analyze(command, depth) {
    if (depth > MAX_DEPTH)
        return { derived: [] };
    let ast;
    try {
        ast = parse(command, { mode: "bash" });
    }
    catch {
        return { derived: [] };
    }
    const derived = [];
    let hard;
    const scope = new Map();
    const addDerived = (value) => {
        const trimmed = value.trim();
        if (trimmed && !derived.includes(trimmed))
            derived.push(trimmed);
    };
    const addHard = (finding) => {
        if (!hard)
            hard = finding;
    };
    const wordText = (word) => typeof word?.text === "string" ? word.text : "";
    const wordIsDynamic = (word) => {
        if (Array.isArray(word?.expansion) && word.expansion.length > 0)
            return true;
        const text = wordText(word);
        return /\$|`/.test(text);
    };
    const words = (value) => Array.isArray(value) ? value : [];
    const walkWord = (word) => {
        for (const expansion of words(word?.expansion)) {
            if (expansion?.type === "CommandExpansion") {
                if (typeof expansion.command === "string")
                    addDerived(expansion.command);
                if (expansion.commandAST)
                    walkNode(expansion.commandAST, scope, depth + 1);
            }
        }
    };
    const walkList = (commands, assignments, level) => {
        for (const node of commands)
            walkNode(node, assignments, level);
    };
    const handleCommand = (node, assignments) => {
        const prefix = words(node?.prefix);
        for (const assignment of prefix) {
            const text = wordText(assignment);
            const eq = text.indexOf("=");
            if (eq <= 0)
                continue;
            const name = text.slice(0, eq);
            const value = text.slice(eq + 1);
            // One same-scope assignment, literal values only. Nested command
            // substitution / variable values are intentionally not tracked.
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && value && !/[$`]/.test(value))
                assignments.set(name, value);
        }
        const nameWord = node?.name;
        const name = wordText(nameWord);
        const suffix = words(node?.suffix);
        const parameter = words(nameWord?.expansion).find((entry) => entry?.type === "ParameterExpansion")?.parameter;
        if (parameter && assignments.has(parameter) && (name === `$${parameter}` || name === `\${${parameter}}`)) {
            const suffixText = suffix.map(wordText);
            // bash-parser strips double quotes; a suffix that looks like a
            // redirect/operator may be a quoted literal argument. Do not turn
            // it into a false Hard Block.
            if (suffixText.every((text) => !/[<>|;&]/.test(text))) {
                const resolved = `${assignments.get(parameter)} ${suffixText.join(" ")}`.trim();
                if (resolved)
                    addDerived(resolved);
            }
        }
        if (name === "eval" || name === "source" || name === ".") {
            if (suffix.length === 0)
                return;
            if (suffix.some(wordIsDynamic)) {
                addHard({
                    code: "dynamic_execution",
                    target: name,
                    reason: "non-literal-eval-source",
                    alternatives: [
                        "Use a literal, reviewed command string; dynamic eval/source cannot be audited.",
                    ],
                });
                return;
            }
            addDerived(suffix.map(wordText).join(" "));
        }
        if (SHELL_COMMAND_NAMES.has(name)) {
            const cIndex = suffix.findIndex((word) => /^-[a-z]*c$/i.test(wordText(word)));
            if (cIndex >= 0 && suffix[cIndex + 1]) {
                const script = suffix[cIndex + 1];
                if (wordIsDynamic(script)) {
                    addHard({
                        code: "dynamic_execution",
                        target: `${name} -c`,
                        reason: "non-literal-shell-command",
                        alternatives: [
                            "Pass a literal, reviewed script string instead of a variable/command substitution.",
                        ],
                    });
                    return;
                }
                addDerived(wordText(script));
            }
        }
        if (name === "env") {
            const start = suffix.findIndex((word) => {
                const value = wordText(word);
                return value && !value.startsWith("-") && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
            });
            if (start >= 0)
                addDerived(suffix.slice(start).map(wordText).join(" "));
        }
        if (name === "find") {
            const execIndex = suffix.findIndex((word) => {
                const value = wordText(word);
                return value === "-exec" || value === "-execdir";
            });
            if (execIndex >= 0) {
                const inner = [];
                for (const word of suffix.slice(execIndex + 1)) {
                    const value = wordText(word);
                    if (value === ";" || value === "+")
                        break;
                    inner.push(value);
                }
                const executable = (inner[0] ?? "").replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
                if (inner.length > 0 && INSPECT_EXECUTABLES.has(executable))
                    addDerived(inner.join(" "));
            }
        }
        for (const word of words(node?.prefix))
            walkWord(word);
        for (const word of words(node?.suffix))
            walkWord(word);
    };
    const walkNode = (node, assignments, level) => {
        if (!node || typeof node !== "object" || level > MAX_DEPTH)
            return;
        if (Array.isArray(node)) {
            for (const item of node)
                walkNode(item, assignments, level);
            return;
        }
        switch (node.type) {
            case "Command":
                handleCommand(node, assignments);
                return;
            case "Script":
            case "CompoundList":
                walkList(words(node.commands), new Map(assignments), level);
                return;
            case "Pipeline":
                walkList(words(node.commands), assignments, level);
                return;
            case "LogicalExpression":
                walkNode(node.left, assignments, level);
                walkNode(node.right, assignments, level);
                return;
            case "Subshell":
                walkNode(node.list, new Map(assignments), level + 1);
                return;
            case "CommandExpansion":
                walkNode(node.commandAST, assignments, level + 1);
                return;
            default:
                for (const value of Object.values(node))
                    walkNode(value, assignments, level);
        }
    };
    walkNode(ast, scope, depth);
    return hard ? { derived, hard } : { derived };
}
const SHELL_COMMAND_NAMES = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const INSPECT_EXECUTABLES = new Set([
    "sh", "bash", "zsh", "dash", "ksh", "fish", "eval", "source", ".",
    "rm", "rmdir", "rd", "del", "erase", "unlink", "shred", "truncate",
    "git", "dd", "mkfs", "mke2fs", "fdisk", "diskpart", "format",
    "docker", "kubectl", "chmod", "chown", "chgrp", "shutdown", "reboot",
    "poweroff", "halt", "systemctl", "find", "curl", "wget", "base64",
    "nc", "ncat", "netcat", "socat", "mv", "cp", "install", "tar", "rsync",
]);
