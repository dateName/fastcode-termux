/** Exhaustiveness helper for closed unions. Adding a variant fails to compile. */
export function assertNever(value: never, context: string): never {
    throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`);
}

export interface StructuredDiff {
    oldText: string;
    newText: string;
    changedStartLine: number;
    oldLineCount: number;
    newLineCount: number;
    truncated: boolean;
}

/** Bounded old/new text plus a line anchor for edit review. */
/** ToolResult/AgentEvent-compatible flat fields, so callers don't copy them. */
export function structuredDiffFields(diff: StructuredDiff) {
    return {
        oldText: diff.oldText,
        newText: diff.newText,
        changedStartLine: diff.changedStartLine,
        oldLineCount: diff.oldLineCount,
        newLineCount: diff.newLineCount,
        diffTruncated: diff.truncated,
    };
}

export function buildStructuredDiff(oldText: string, newText: string, limit = 16_384): StructuredDiff {
    const before = String(oldText ?? "");
    const after = String(newText ?? "");
    const oldLines = before.split(/\r?\n/);
    const newLines = after.split(/\r?\n/);
    let same = 0;
    while (same < oldLines.length && same < newLines.length && oldLines[same] === newLines[same])
        same += 1;
    const truncated = before.length > limit || after.length > limit;
    return {
        oldText: before.slice(0, limit),
        newText: after.slice(0, limit),
        changedStartLine: same + 1,
        oldLineCount: oldLines.length,
        newLineCount: newLines.length,
        truncated,
    };
}

export interface RepairedJsonObject {
    value?: Record<string, unknown>;
    repaired: boolean;
    error?: string;
}

/**
 * Parse a tool-call arguments string, applying one conservative repair pass for
 * common model mistakes: trailing commas, an unclosed string, missing closing
 * braces/brackets, and a single-element array wrapper. Unknown or type-wrong
 * fields are left to the normal tool validation so they still fail explicitly.
 */
export function parseJsonObjectWithRepair(raw: string): RepairedJsonObject {
    const input = String(raw ?? "").trim();
    if (!input)
        return { value: {}, repaired: false };
    const candidates = new Set<string>();
    const add = (value: string | undefined) => {
        if (value)
            candidates.add(value);
    };
    add(input);
    const noTrailing = removeTrailingCommas(input);
    add(noTrailing);
    const closed = closeUnclosed(input);
    add(closed);
    add(closed ? removeTrailingCommas(closed) : undefined);
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed) && parsed.length === 1 && isObject(parsed[0])) {
                const coerced = coerceKnownScalars(parsed[0]);
                return { value: coerced.value, repaired: true };
            }
            if (isObject(parsed)) {
                const coerced = coerceKnownScalars(parsed);
                return { value: coerced.value, repaired: candidate !== input || coerced.changed };
            }
        }
        catch {
            // try the next candidate
        }
    }
    return { error: "arguments are not a valid JSON object", repaired: false };
}

const NUMBER_ARG_KEYS = new Set([
    "timeoutMs", "waitMs", "offset", "limit", "maxBytes", "maxResults", "maxDepth", "expectedMatches",
]);
const BOOLEAN_ARG_KEYS = new Set([
    "overwrite", "recursive", "caseSensitive", "all", "includeHidden", "followSymlinks", "force",
]);

function coerceKnownScalars(value: Record<string, unknown>): { value: Record<string, unknown>; changed: boolean } {
    let changed = false;
    const out: Record<string, unknown> = { ...value };
    for (const [key, raw] of Object.entries(out)) {
        if (typeof raw !== "string")
            continue;
        const text = raw.trim();
        if (NUMBER_ARG_KEYS.has(key) && /^-?\d+(?:\.\d+)?$/.test(text)) {
            out[key] = Number(text);
            changed = true;
        }
        else if (BOOLEAN_ARG_KEYS.has(key) && /^(?:true|false|1|0|yes|no|on|off)$/i.test(text)) {
            out[key] = ["true", "1", "yes", "on"].includes(text.toLowerCase());
            changed = true;
        }
    }
    return { value: out, changed };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function removeTrailingCommas(input: string): string {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];
        if (inString) {
            out += ch;
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
            out += ch;
            continue;
        }
        if (ch === ",") {
            let next = i + 1;
            while (next < input.length && /\s/.test(input[next]))
                next += 1;
            if (input[next] === "}" || input[next] === "]")
                continue;
        }
        out += ch;
    }
    return out;
}

function closeUnclosed(input: string): string | undefined {
    let inString = false;
    let escaped = false;
    const stack: string[] = [];
    for (const ch of input) {
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
        if (ch === "{")
            stack.push("}");
        else if (ch === "[")
            stack.push("]");
        else if (ch === "}" || ch === "]") {
            if (stack.pop() !== ch)
                return undefined;
        }
    }
    let out = input;
    if (inString)
        out += '"';
    while (stack.length > 0)
        out += stack.pop();
    return out !== input ? out : undefined;
}
