import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";

export interface DiffPreviewItem {
    path: string;
    unified: string;
}

/** Bounded unified diff text for plain/json/terminal fallbacks. */
export function formatUnifiedDiff(unified: string, maxLines = 50): string {
    const raw = String(unified ?? "").split(/\r?\n/);
    let oldLine = 0;
    let newLine = 0;
    const lines: string[] = [];
    const pad = (value: number | undefined) => value === undefined ? "     " : String(value).padStart(5);
    for (const line of raw) {
        const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (header) {
            oldLine = Number(header[1]);
            newLine = Number(header[2]);
            lines.push(line);
            continue;
        }
        if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) {
            lines.push(line);
            continue;
        }
        if (line.startsWith("-")) {
            lines.push(`${pad(oldLine)}       | ${line}`);
            oldLine += 1;
        }
        else if (line.startsWith("+")) {
            lines.push(`      ${pad(newLine)} | ${line}`);
            newLine += 1;
        }
        else {
            lines.push(`${pad(oldLine)} ${pad(newLine)} | ${line}`);
            oldLine += 1;
            newLine += 1;
        }
    }
    if (lines.length <= maxLines)
        return lines.join("\n");
    const header: string[] = [];
    const hunks: string[][] = [];
    let current: string[] | undefined;
    for (const line of lines) {
        if (line.startsWith("@@")) {
            current = [line];
            hunks.push(current);
        }
        else if (current)
            current.push(line);
        else
            header.push(line);
    }
    if (hunks.length === 0)
        return [...lines.slice(0, maxLines), `[... ${lines.length - maxLines} lines omitted ...]`].join("\n");
    const kept = [...header];
    let used = header.length;
    let omitted = 0;
    for (const hunk of hunks) {
        if (kept.length === header.length || used + hunk.length <= maxLines) {
            kept.push(...hunk);
            used += hunk.length;
        }
        else
            omitted += 1;
    }
    if (omitted === 0)
        return lines.join("\n");
    return [...kept, `[... ${omitted} hunk(s) omitted; use /expand <id> for the full output ...]`].join("\n");
}

export function formatDiffPreview(diffs: DiffPreviewItem[] | undefined, maxLines = 50): string {
    if (!diffs?.length)
        return "";
    const perFile = Math.max(8, Math.floor(maxLines / diffs.length));
    return diffs
        .map((diff) => `### ${diff.path}\n${formatUnifiedDiff(diff.unified, perFile)}`)
        .join("\n\n");
}

/** Compact Ink rendering; the caller owns layout and permissions. */
export const DiffPreview = ({ diffs, theme, maxLines = 50 }: any) => {
    const text = formatDiffPreview(diffs, maxLines);
    if (!text)
        return null;
    const lines = text.split("\n");
    return (_jsx(Box, { flexDirection: "column", marginLeft: 2, children: lines.map((line, index) => {
        const body = line.slice(line.indexOf("| ") + 2);
        const color = body.startsWith("+") ? theme?.success ?? "green" : body.startsWith("-") ? theme?.error ?? "red" : theme?.muted;
        return _jsx(Text, { color, children: line }, index);
    }) }));
};
