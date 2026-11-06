// Some models (notably DeepSeek) emit their native "DSML" tool-call markup
// instead of <fastcode_tool>. The markers look like `<｜DSML｜invoke ...>`
// (U+FF5C fullwidth bar, sometimes doubled or spaced). We canonicalize those
// markers back to plain angle-bracket tags and then parse the
// calls -> invoke -> parameter structure as a second dialect.
const FASTCODE_TOOL_OPEN = "<fastcode_tool>";
const FASTCODE_TOOL_CLOSE_RE = /<\/\s*fastcode_tool\s*>/gi;
const RESIDUAL_CLOSE_RE = /<\/\s*(?:fastcode_tool|parameter|invoke|calls)\s*>/i;
const DSML_OPEN_RE = /<\s*(?:[|｜]\s*)+DSML\s*(?:[|｜]\s*)+/gi;
const DSML_CLOSE_RE = /<\/\s*(?:[|｜]\s*)+DSML\s*(?:[|｜]\s*)+/gi;
const DSML_BLOCK_RE = /<([a-z_]*calls?)>([\s\S]*?)<\/\s*\1\s*>/gi;
const DSML_INVOKE_RE = /<invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/\s*invoke\s*>/gi;
const DSML_PARAM_RE = /<parameter\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/\s*parameter\s*>/gi;
const INVOKE_OPEN_RE = /<invoke\s+name="([^"]+)"\s*>/gi;

export interface ToolCallRecord {
    tool: string;
    [key: string]: any;
}

export interface ToolCallParseResult {
    calls: ToolCallRecord[];
    /** End offset of the last complete construct that was consumed. */
    consumedEnd: number;
    /** True parse failures. Salvaged calls do not add an error. */
    errors: string[];
}

/** Turn the DSML glyph markers into ordinary `<tag>` / `</tag>` tags. */
function canonicalizeDsml(text) {
    return text.replace(DSML_CLOSE_RE, "</").replace(DSML_OPEN_RE, "<");
}
function invokeToCall(invoke): ToolCallRecord {
    const call: ToolCallRecord = { tool: invoke[1] };
    for (const param of (invoke[2] ?? "").matchAll(DSML_PARAM_RE))
        call[param[1]] = coerceDsmlValue(param[2] ?? "", param[3] ?? "");
    return call;
}
function insideSpan(start: number, spans: Array<{ start: number; end: number }>): boolean {
    return spans.some((span) => start >= span.start && start < span.end);
}
function matchFrom(text: string, from: number, re: RegExp): { start: number; end: number } | undefined {
    re.lastIndex = from;
    const match = re.exec(text);
    if (!match || match.index === undefined)
        return undefined;
    return { start: match.index, end: match.index + match[0].length };
}
function parseJsonCall(body: string): ToolCallRecord | undefined {
    try {
        const parsed = JSON.parse(body.trim());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.tool === "string")
            return parsed as ToolCallRecord;
    }
    catch {
        // Malformed JSON is reported by the caller.
    }
    return undefined;
}
/**
 * Recover a JSON object that starts at the beginning of `text` but may be
 * followed by more markup (for example a drifted close tag). Returns the
 * consumed prefix length so the caller can continue after it.
 */
function salvageJsonPrefix(text: string): { call: ToolCallRecord; consumed: number } | undefined {
    let searchFrom = 0;
    while (searchFrom < text.length) {
        const end = text.indexOf("}", searchFrom);
        if (end < 0)
            return undefined;
        const call = parseJsonCall(text.slice(0, end + 1));
        if (call) {
            const close = matchFrom(text, end + 1, FASTCODE_TOOL_CLOSE_RE);
            return { call, consumed: close ? close.end : end + 1 };
        }
        searchFrom = end + 1;
    }
    return undefined;
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
/**
 * Parse all complete tool calls, then salvage only the *remaining* text.
 *
 * Invariants (regression-tested):
 * - a complete construct is consumed exactly once and never rescanned;
 * - the salvage pass receives `raw.slice(consumedEnd)`, never the full text;
 * - two adjacent normal calls plus a stray close tag stays at two calls.
 */
export function parseToolCalls(text): ToolCallParseResult {
    const raw = canonicalizeDsml(String(text ?? ""));
    const calls: ToolCallRecord[] = [];
    const errors: string[] = [];
    const spans: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    while (cursor < raw.length) {
        const open = raw.indexOf(FASTCODE_TOOL_OPEN, cursor);
        if (open < 0)
            break;
        const innerStart = open + FASTCODE_TOOL_OPEN.length;
        const close = matchFrom(raw, innerStart, FASTCODE_TOOL_CLOSE_RE);
        if (!close) {
            const salvaged = salvageJsonPrefix(raw.slice(innerStart));
            if (salvaged) {
                calls.push(salvaged.call);
                cursor = innerStart + salvaged.consumed;
                spans.push({ start: open, end: cursor });
                continue;
            }
            errors.push("unclosed <fastcode_tool> block; re-emit a complete tool call");
            break;
        }
        const body = raw.slice(innerStart, close.start);
        const full = parseJsonCall(body);
        if (full) {
            calls.push(full);
            spans.push({ start: open, end: close.end });
            cursor = close.end;
            continue;
        }
        // Closing drift: the JSON may be valid even when extra markup (or a
        // second opener) sits before the matched close tag.
        const prefix = salvageJsonPrefix(body);
        if (prefix) {
            calls.push(prefix.call);
            cursor = innerStart + prefix.consumed;
            spans.push({ start: open, end: cursor });
            continue;
        }
        errors.push("invalid JSON inside <fastcode_tool>; re-emit a complete tool call");
        spans.push({ start: open, end: close.end });
        cursor = close.end;
    }

    // DSML dialect: parse each complete block once, then complete invokes that
    // did not belong to a block. Spans prevent a second parse of the same text.
    for (const block of raw.matchAll(DSML_BLOCK_RE)) {
        const start = block.index ?? 0;
        const end = start + block[0].length;
        if (insideSpan(start, spans))
            continue;
        for (const invoke of (block[2] ?? "").matchAll(DSML_INVOKE_RE))
            calls.push(invokeToCall(invoke));
        spans.push({ start, end });
    }
    for (const invoke of raw.matchAll(DSML_INVOKE_RE)) {
        const start = invoke.index ?? 0;
        if (insideSpan(start, spans))
            continue;
        calls.push(invokeToCall(invoke));
        spans.push({ start, end: start + invoke[0].length });
    }

    const consumedEnd = spans.reduce((max, span) => Math.max(max, span.end), 0);
    salvageResidual(raw.slice(consumedEnd), calls, errors);
    return { calls, consumedEnd, errors };
}

function salvageResidual(tail: string, calls: ToolCallRecord[], errors: string[]): void {
    if (!tail.trim())
        return;
    let salvaged = false;

    const toolOpen = tail.indexOf(FASTCODE_TOOL_OPEN);
    if (toolOpen >= 0) {
        const recovered = salvageJsonPrefix(tail.slice(toolOpen + FASTCODE_TOOL_OPEN.length));
        if (recovered) {
            calls.push(recovered.call);
            salvaged = true;
        }
        else {
            errors.push("unclosed <fastcode_tool> block; re-emit a complete tool call");
        }
    }

    const openers = Array.from(tail.matchAll(INVOKE_OPEN_RE));
    openers.forEach((opener, index) => {
        const start = opener.index ?? 0;
        const bodyStart = start + opener[0].length;
        const nextStart = openers[index + 1]?.index ?? tail.length;
        const call = invokeToCall({ 1: opener[1], 2: tail.slice(bodyStart, nextStart) });
        if (Object.keys(call).length > 1) {
            calls.push(call);
            salvaged = true;
        }
        else {
            errors.push(`incomplete invoke for "${opener[1]}"; re-emit a complete tool call`);
        }
    });

    if (!salvaged && openers.length === 0 && toolOpen < 0 && RESIDUAL_CLOSE_RE.test(tail))
        errors.push("stray closing tag without an opening tool call; re-emit a complete tool call");
}

export function stripToolCalls(text) {
    return canonicalizeDsml(String(text ?? ""))
        .replace(/<fastcode_tool>[\s\S]*?<\/\s*fastcode_tool\s*>/gi, "")
        .replace(DSML_BLOCK_RE, "")
        .replace(/<fastcode_tool>[\s\S]*$/i, "")
        .replace(/<\/\s*(?:fastcode_tool|parameter|invoke|calls)\s*>/gi, "")
        .trim();
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
- read_file range: {"tool":"read_file","path":"large.ts","offset":800,"limit":50}
  offset is 1-based; use it instead of reading a large file from the start.
- read_many: {"tool":"read_many","paths":["file1","file2"],"maxBytes":300000}
- write_file: {"tool":"write_file","path":"path/to/file","content":"full file contents"}
- append_file: {"tool":"append_file","path":"path/to/file","content":"text to append"}
- apply_patch: {"tool":"apply_patch","patch":"*** Begin Patch\\n*** Update File: path\\n@@\\n-old\\n+new\\n*** End Patch\\n"}
- list_files: {"tool":"list_files","path":"optional/path","maxDepth":2,"detail":false}
- read_file is capped (default 200KB); grep skips files over 1MB. .fastcodeignore is honored.
- grep: {"tool":"grep","pattern":"text or regex","path":"optional/path","caseSensitive":false,"glob":"*.ts","context":2,"maxResults":200}
- replace_in_file: {"tool":"replace_in_file","path":"path/to/file","find":"exact text","replace":"replacement","expectedMatches":1}
- stat_path: {"tool":"stat_path","path":"path/to/file"}
- make_dir: {"tool":"make_dir","path":"path/to/dir"}
- copy_file: {"tool":"copy_file","from":"src","to":"dest","overwrite":false}
- move_path: {"tool":"move_path","from":"src","to":"dest"}
- delete_file: {"tool":"delete_file","path":"path/to/file","recursive":false}

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
