const TOOL_RE = /<fastcode_tool>([\s\S]*?)<\/fastcode_tool>/g;
// Some models (notably DeepSeek) emit their native "DSML" tool-call markup
// instead of <fastcode_tool>. The markers look like `<｜DSML｜invoke ...>`
// (U+FF5C fullwidth bar, sometimes doubled or spaced). We canonicalize those
// markers back to plain angle-bracket tags and then parse the
// calls -> invoke -> parameter structure as a second dialect.
const DSML_OPEN_RE = /<\s*(?:[|｜]\s*)+DSML\s*(?:[|｜]\s*)+/gi;
const DSML_CLOSE_RE = /<\/\s*(?:[|｜]\s*)+DSML\s*(?:[|｜]\s*)+/gi;
const DSML_BLOCK_RE = /<([a-z_]*calls?)>([\s\S]*?)<\/\1>/gi;
const DSML_INVOKE_RE = /<invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/invoke>/gi;
const DSML_PARAM_RE = /<parameter\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/parameter>/gi;
/** Turn the DSML glyph markers into ordinary `<tag>` / `</tag>` tags. */
function canonicalizeDsml(text) {
    return text.replace(DSML_CLOSE_RE, "</").replace(DSML_OPEN_RE, "<");
}
function coerceDsmlValue(attrs, raw) {
    const value = raw.replace(/^\n/, "").replace(/\n$/, "");
    if (/\bstring\s*=\s*"true"/i.test(attrs))
        return value;
    const trimmed = value.trim();
    if (trimmed === "")
        return "";
    try {
        return JSON.parse(trimmed);
    }
    catch {
        if (trimmed === "true")
            return true;
        if (trimmed === "false")
            return false;
        const n = Number(trimmed);
        return Number.isNaN(n) ? value : n;
    }
}
function parseDsmlCalls(text) {
    const canonical = canonicalizeDsml(text);
    const bodies = [];
    for (const block of canonical.matchAll(DSML_BLOCK_RE))
        bodies.push(block[2] ?? "");
    if (bodies.length === 0)
        bodies.push(canonical);
    const calls = [];
    for (const body of bodies) {
        for (const invoke of body.matchAll(DSML_INVOKE_RE)) {
            const call = { tool: invoke[1] };
            for (const param of (invoke[2] ?? "").matchAll(DSML_PARAM_RE))
                call[param[1]] = coerceDsmlValue(param[2] ?? "", param[3] ?? "");
            calls.push(call);
        }
    }
    return calls;
}
export function parseToolCalls(text) {
    const calls = [];
    for (const match of text.matchAll(TOOL_RE)) {
        const raw = match[1]?.trim();
        if (!raw)
            continue;
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed.tool === "string")
                calls.push(parsed);
        }
        catch {
            // Ignore malformed tool blocks; the model can correct itself next turn.
        }
    }
    calls.push(...parseDsmlCalls(text));
    return calls;
}
export function stripToolCalls(text) {
    return canonicalizeDsml(text).replace(TOOL_RE, "").replace(DSML_BLOCK_RE, "").trim();
}
export function formatToolResults(results) {
    const blocks = results.map((r, index) => {
        const status = r.ok ? "ok" : "error";
        return [
            `Tool result ${index + 1} (${status})`,
            `call: ${JSON.stringify(r.call)}`,
            "output:",
            fence(r.output),
        ].join("\n");
    });
    return [
        "FastCode executed the requested local tools. Use these results to continue.",
        ...blocks,
    ].join("\n\n");
}
export const AGENT_SYSTEM_PROMPT = `
You are FastCode Agent, a local coding agent running inside the user's terminal.
Tools run inside a filesystem sandbox rooted at the current working directory.
File tools cannot access paths outside that root. Shell commands run with FASTCODE_SANDBOX=1 and FASTCODE_SANDBOX_ROOT set.

You can inspect and change the user's machine by emitting exactly one or more tool calls in this format:
<fastcode_tool>{"tool":"shell","command":"npm test"}</fastcode_tool>

Available tools:
- shell: {"tool":"shell","command":"command to run"}
- shell with timeout: {"tool":"shell","command":"npm test","timeoutMs":120000}
- shell poll (long commands return a session id): {"tool":"shell","session_id":"sh_..."}
  Polling returns only new output; use waitMs to wait briefly for more.
- pwd: {"tool":"pwd"}
- read_file: {"tool":"read_file","path":"path/to/file"}
- read_many: {"tool":"read_many","paths":["file1","file2"]}
- write_file: {"tool":"write_file","path":"path/to/file","content":"full file contents"}
- append_file: {"tool":"append_file","path":"path/to/file","content":"text to append"}
- apply_patch: {"tool":"apply_patch","patch":"*** Begin Patch\\n*** Update File: path\\n@@\\n-old\\n+new\\n*** End Patch\\n"}
- list_files: {"tool":"list_files","path":"optional/path","maxDepth":2,"detail":false}
- read_file is capped (default 200KB); grep skips files over 1MB. .fastcodeignore is honored.
- grep: {"tool":"grep","pattern":"text or regex","path":"optional/path"}
- replace_in_file: {"tool":"replace_in_file","path":"path/to/file","find":"exact text","replace":"replacement"}
- stat_path: {"tool":"stat_path","path":"path/to/file"}
- make_dir: {"tool":"make_dir","path":"path/to/dir"}
- copy_file: {"tool":"copy_file","from":"src","to":"dest"}
- move_path: {"tool":"move_path","from":"src","to":"dest"}
- delete_file: {"tool":"delete_file","path":"path/to/file"}

Rules:
- Prefer inspecting files before editing.
- Use shell for tests, builds, package scripts, git inspection, and OS commands.
- Use apply_patch or replace_in_file for focused edits.
- Use write_file only when replacing the whole file is appropriate.
- Run verification commands after code changes.
- After tool results come back, continue working until the user's request is done.
- When done, answer normally without tool calls.
`.trim();
function fence(text) {
    return `\`\`\`\n${text}\n\`\`\``;
}
