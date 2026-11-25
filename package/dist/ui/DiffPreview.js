import { jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
/** Bounded unified diff text for plain/json/terminal fallbacks. */
export function formatUnifiedDiff(unified, maxLines = 50) {
    const raw = String(unified ?? "").split(/\r?\n/);
    let oldLine = 0;
    let newLine = 0;
    const lines = [];
    const pad = (value) => value === undefined ? "     " : String(value).padStart(5);
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
    return [...lines.slice(0, maxLines), `[... ${lines.length - maxLines} lines omitted ...]`].join("\n");
}
export function formatDiffPreview(diffs, maxLines = 50) {
    if (!diffs?.length)
        return "";
    const perFile = Math.max(8, Math.floor(maxLines / diffs.length));
    return diffs
        .map((diff) => `### ${diff.path}\n${formatUnifiedDiff(diff.unified, perFile)}`)
        .join("\n\n");
}
/** Compact Ink rendering; the caller owns layout and permissions. */
export const DiffPreview = ({ diffs, theme, maxLines = 50 }) => {
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
