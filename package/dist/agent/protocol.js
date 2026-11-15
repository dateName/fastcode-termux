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
const HERMES_BLOCK_RE = /<tool_call>([\s\S]*?)<\/\s*tool_call\s*>/gi;
const KIMI_SECTION_RE = /<\|tool_calls_section_begin\|>([\s\S]*?)<\|tool_calls_section_end\|>/gi;
const KIMI_CALL_RE = /<\|tool_call_begin\|>\s*([\s\S]*?)\s*<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/gi;
const MISTRAL_PREFIX = "[TOOL_CALLS]";
const LLAMA_TAG = "<|python_tag|>";
// Open markers used by dialects we do not parse yet. Seeing one with zero
// parsed calls must fail loudly instead of ending the turn as "complete".
const FOREIGN_DIALECT_RES = [
    /<tool_calls?\b[^>]*>/i,
    /<function_calls?\b[^>]*>/i,
    /<function\s*=/i,
    /<\|tool_call\|>/i,
    /<\|python_tag\|>/i,
    /\[TOOL_CALLS\]/i,
    /<antml:invoke\b/i,
];
/** Turn the DSML glyph markers into ordinary `<tag>` / `</tag>` tags. */
function canonicalizeDsml(text) {
    return text.replace(DSML_CLOSE_RE, "</").replace(DSML_OPEN_RE, "<");
}
function invokeToCall(invoke) {
    const call = { tool: invoke[1] };
    for (const param of (invoke[2] ?? "").matchAll(DSML_PARAM_RE))
        call[param[1]] = coerceDsmlValue(param[2] ?? "", param[3] ?? "");
    return call;
}
function insideSpan(start, spans) {
    return spans.some((span) => start >= span.start && start < span.end);
}
function matchFrom(text, from, re) {
    re.lastIndex = from;
    const match = re.exec(text);
    if (!match || match.index === undefined)
        return undefined;
    return { start: match.index, end: match.index + match[0].length };
}
function parseJsonCall(body) {
    try {
        const parsed = JSON.parse(body.trim());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.tool === "string")
            return parsed;
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
function salvageJsonPrefix(text) {
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
/** Balanced JSON object/array starting at the first `{` or `[`. */
function extractJsonValue(text) {
    const start = text.search(/[\[{]/);
    if (start < 0)
        return undefined;
    const open = text[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === "\\")
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === open)
            depth += 1;
        else if (ch === close) {
            depth -= 1;
            if (depth === 0) {
                try {
                    return { value: JSON.parse(text.slice(start, i + 1)), consumed: i + 1 };
                }
                catch {
                    return undefined;
                }
            }
        }
    }
    return undefined;
}
/** Normalize `{name, arguments|parameters|args}` into a FastCode call. */
function dialectCall(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const name = typeof value.name === "string" ? value.name : typeof value.tool === "string" ? value.tool : undefined;
    if (!name)
        return undefined;
    let args = value.arguments ?? value.parameters ?? value.args ?? {};
    if (typeof args === "string") {
        try {
            args = JSON.parse(args);
        }
        catch {
            return undefined;
        }
    }
    if (!args || typeof args !== "object" || Array.isArray(args))
        return undefined;
    return { ...args, tool: name, ...(typeof value.id === "string" ? { id: value.id } : {}) };
}
function parseHermesBlock(body) {
    let parsed;
    try {
        parsed = JSON.parse(body.trim());
    }
    catch {
        return undefined;
    }
    const values = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.tool_calls)
            ? parsed.tool_calls
            : [parsed];
    const calls = [];
    for (const value of values) {
        const call = dialectCall(value);
        if (call)
            calls.push(call);
    }
    return calls.length > 0 ? calls : undefined;
}
/** Hermes / Qwen: `<tool_call>{"name":...,"arguments":{...}}</tool_call>`. */
function parseHermes(raw, calls, errors, spans, detected) {
    for (const block of raw.matchAll(HERMES_BLOCK_RE)) {
        const start = block.index ?? 0;
        const end = start + block[0].length;
        if (insideSpan(start, spans))
            continue;
        // DSML canonicalization also produces `<tool_call>` wrappers around
        // `<invoke>`; those belong to the DSML pass.
        if (/<invoke\s+name=/i.test(block[1] ?? ""))
            continue;
        detected.add("hermes");
        const parsed = parseHermesBlock(block[1] ?? "");
        if (parsed) {
            calls.push(...parsed);
            spans.push({ start, end });
        }
        else {
            errors.push("invalid Hermes/Qwen <tool_call> JSON; re-emit a complete tool call");
            spans.push({ start, end });
        }
    }
}
/**
 * Mistral argument payload. Pre-v11 starts with `[`; v11+ is the `{...}` after
 * `name[CALL_ID]`. Do not let `[CALL_ID]` be mistaken for the JSON array start.
 */
function extractMistralArgs(chunk) {
    const trimmed = chunk.trimStart();
    const leading = chunk.length - trimmed.length;
    if (trimmed.startsWith("[")) {
        const json = extractJsonValue(trimmed);
        return json ? { json, start: leading } : undefined;
    }
    const brace = chunk.indexOf("{");
    if (brace < 0)
        return undefined;
    const json = extractJsonValue(chunk.slice(brace));
    return json ? { json, start: brace } : undefined;
}
/** Mistral: pre-v11 JSON array or v11+ `name[CALL_ID]?{...}`, no close tag. */
function parseMistral(raw, calls, errors, spans, detected) {
    let cursor = 0;
    while (true) {
        const index = raw.indexOf(MISTRAL_PREFIX, cursor);
        if (index < 0)
            return;
        detected.add("mistral");
        const after = index + MISTRAL_PREFIX.length;
        const next = raw.indexOf(MISTRAL_PREFIX, after);
        const chunk = raw.slice(after, next < 0 ? raw.length : next);
        const args = extractMistralArgs(chunk);
        if (!args) {
            errors.push("Mistral [TOOL_CALLS] is missing JSON arguments");
            cursor = after;
            continue;
        }
        let parsed = 0;
        if (Array.isArray(args.json.value)) {
            for (const item of args.json.value) {
                const call = dialectCall(item);
                if (call) {
                    calls.push(call);
                    parsed += 1;
                }
            }
        }
        else {
            const header = chunk.slice(0, args.start).trim();
            const idMatch = header.match(/\[([^\]]+)\]\s*$/);
            const id = idMatch?.[1];
            const name = header.replace(/\[[^\]]+\]\s*$/, "").replace(/^functions\./, "").trim();
            if (name && args.json.value && typeof args.json.value === "object" && !Array.isArray(args.json.value)) {
                // v11+: the `{...}` after the header *is* the arguments object.
                calls.push({ ...args.json.value, tool: name, ...(id ? { id } : {}) });
                parsed += 1;
            }
        }
        if (parsed === 0)
            errors.push("Mistral [TOOL_CALLS] payload is not a tool call");
        const end = after + args.start + args.json.consumed;
        spans.push({ start: index, end });
        cursor = Math.max(end, after + 1);
    }
}
/** Kimi K2: section/call/argument markers; name comes from the ID header. */
function parseKimi(raw, calls, errors, spans, detected) {
    for (const section of raw.matchAll(KIMI_SECTION_RE)) {
        const start = section.index ?? 0;
        const end = start + section[0].length;
        if (insideSpan(start, spans))
            continue;
        detected.add("kimi");
        let parsed = 0;
        for (const call of (section[1] ?? "").matchAll(KIMI_CALL_RE)) {
            const idHeader = (call[1] ?? "").trim();
            const name = idHeader.split(":")[0].replace(/^functions\./, "").trim();
            const json = extractJsonValue(call[2] ?? "");
            const normalized = name && json && json.value && typeof json.value === "object" && !Array.isArray(json.value)
                ? { ...json.value, tool: name, id: idHeader }
                : undefined;
            if (normalized) {
                calls.push(normalized);
                parsed += 1;
            }
        }
        if (parsed === 0)
            errors.push("Kimi tool-call section has no valid call");
        spans.push({ start, end });
    }
}
/**
 * Llama: tagged `<|python_tag|>{...}` plus a bare leading JSON object fallback.
 * `parameters` is normalized to `arguments`.
 */
function parseLlama(raw, calls, errors, spans, detected) {
    let index = raw.indexOf(LLAMA_TAG);
    while (index >= 0) {
        detected.add("llama");
        const after = index + LLAMA_TAG.length;
        const json = extractJsonValue(raw.slice(after));
        if (!json) {
            errors.push("invalid Llama <|python_tag|> JSON");
            index = raw.indexOf(LLAMA_TAG, after);
            continue;
        }
        const call = dialectCall(json.value);
        if (call) {
            calls.push(call);
            spans.push({ start: index, end: after + json.consumed });
        }
        else {
            errors.push("Llama <|python_tag|> JSON is not a tool call");
        }
        index = raw.indexOf(LLAMA_TAG, after + json.consumed);
    }
    // Full-turn/non-streaming fallback: a bare leading object with tool shape.
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && calls.length === 0 && spans.length === 0 && errors.length === 0) {
        try {
            const value = JSON.parse(trimmed);
            if (value && typeof value === "object" && ("arguments" in value || "parameters" in value)) {
                const call = dialectCall(value);
                if (call) {
                    detected.add("llama");
                    calls.push(call);
                    spans.push({ start: raw.indexOf("{"), end: raw.length });
                }
            }
        }
        catch {
            // Not a bare JSON object; leave it as content.
        }
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
export function parseToolCalls(text) {
    const raw = canonicalizeDsml(String(text ?? ""));
    const calls = [];
    const errors = [];
    const spans = [];
    const detected = new Set();
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
    // Supported text dialects. Each detector records its family even when the
    // payload is malformed, so a zero-call result cannot be mistaken for a
    // normal answer. Spans keep the passes from double-consuming one another.
    parseHermes(raw, calls, errors, spans, detected);
    parseMistral(raw, calls, errors, spans, detected);
    parseKimi(raw, calls, errors, spans, detected);
    parseLlama(raw, calls, errors, spans, detected);
    // DSML dialect: parse each complete block once, then complete invokes that
    // did not belong to a block. Spans prevent a second parse of the same text.
    for (const block of raw.matchAll(DSML_BLOCK_RE)) {
        const start = block.index ?? 0;
        const end = start + block[0].length;
        if (insideSpan(start, spans))
            continue;
        // Only consume blocks that actually carry DSML invokes. A foreign
        // `<tool_call>{"name":...}</tool_call>` has JSON, not <invoke>, so it is
        // left intact for visible text and for the dialect check below.
        const invokes = Array.from((block[2] ?? "").matchAll(DSML_INVOKE_RE));
        if (invokes.length === 0)
            continue;
        for (const invoke of invokes)
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
    // A known dialect marker with no parsed calls is an explicit protocol
    // failure, not a normal answer. Otherwise the caller records "complete"
    // and the user sees an empty reply with no way to diagnose it.
    if (calls.length === 0 && errors.length === 0) {
        if (detected.size > 0) {
            errors.push(`Tool-call dialect detected (${Array.from(detected).join(", ")}) but no valid call was parsed; ` +
                "re-emit a complete tool call.");
        }
        else if (FOREIGN_DIALECT_RES.some((re) => re.test(raw))) {
            errors.push("Unsupported tool-call dialect: the reply contains a tool-call marker FastCode cannot parse. " +
                "Re-emit a complete <fastcode_tool>{\"tool\":...}</fastcode_tool> block.");
        }
    }
    return { calls, consumedEnd, errors, detectedDialects: Array.from(detected) };
}
function salvageResidual(tail, calls, errors) {
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
function stripMistralText(text) {
    let out = "";
    let cursor = 0;
    while (true) {
        const index = text.indexOf(MISTRAL_PREFIX, cursor);
        if (index < 0) {
            out += text.slice(cursor);
            return out;
        }
        out += text.slice(cursor, index);
        const after = index + MISTRAL_PREFIX.length;
        const args = extractMistralArgs(text.slice(after));
        if (!args) {
            out += MISTRAL_PREFIX;
            cursor = after;
            continue;
        }
        cursor = after + args.start + args.json.consumed;
    }
}
function stripLlamaText(text) {
    let out = "";
    let cursor = 0;
    while (true) {
        const index = text.indexOf(LLAMA_TAG, cursor);
        if (index < 0) {
            out += text.slice(cursor);
            return out;
        }
        const after = index + LLAMA_TAG.length;
        const json = extractJsonValue(text.slice(after));
        if (!json || !dialectCall(json.value)) {
            out += text.slice(cursor, after);
            cursor = after;
            continue;
        }
        out += text.slice(cursor, index);
        cursor = after + json.consumed;
    }
}
export function stripToolCalls(text) {
    let out = canonicalizeDsml(String(text ?? ""))
        .replace(/<fastcode_tool>[\s\S]*?<\/\s*fastcode_tool\s*>/gi, "")
        .replace(DSML_BLOCK_RE, (block) => /<invoke\s+name=/i.test(block) ? "" : block)
        .replace(/<fastcode_tool>[\s\S]*$/i, "");
    // Remove only well-formed supported dialects; malformed markup stays visible
    // for diagnosis (and the parser will report a protocol error).
    out = out.replace(HERMES_BLOCK_RE, (whole, body) => parseHermesBlock(body) ? "" : whole);
    out = out.replace(KIMI_SECTION_RE, (whole, body) => Array.from((body ?? "").matchAll(KIMI_CALL_RE)).length > 0 ? "" : whole);
    out = stripMistralText(out);
    out = stripLlamaText(out);
    // Bare leading JSON tool call (Llama full-turn fallback).
    const trimmed = out.trim();
    if (trimmed.startsWith("{")) {
        try {
            const value = JSON.parse(trimmed);
            if (value && typeof value === "object" && ("arguments" in value || "parameters" in value) && dialectCall(value))
                out = "";
        }
        catch {
            // Not JSON; keep it as visible text.
        }
    }
    return out
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
