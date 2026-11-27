/** Line-based diff primitives shared by patch planning and edit previews. */

export interface DiffLine {
    type: " " | "-" | "+";
    text: string;
    oldLine: number;
    newLine: number;
}

export interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: DiffLine[];
}

interface SplitContent {
    lines: string[];
    endsWithNewline: boolean;
}

export function splitContent(content: string): SplitContent {
    if (content === "")
        return { lines: [], endsWithNewline: false };
    const endsWithNewline = content.endsWith("\n");
    const lines = content.split(/\r?\n/);
    if (endsWithNewline)
        lines.pop();
    return { lines, endsWithNewline };
}

function fallbackDiff(a: string[], b: string[]): DiffLine[] {
    const n = a.length;
    const m = b.length;
    let prefix = 0;
    while (prefix < n && prefix < m && a[prefix] === b[prefix])
        prefix += 1;
    let suffix = 0;
    while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix])
        suffix += 1;
    const out: DiffLine[] = [];
    for (let index = 0; index < prefix; index += 1)
        out.push({ type: " ", text: a[index], oldLine: index + 1, newLine: index + 1 });
    const oldMid = a.slice(prefix, n - suffix);
    const newMid = b.slice(prefix, m - suffix);
    const anchors = uniqueAnchors(oldMid, newMid);
    let oldCursor = 0;
    let newCursor = 0;
    for (const anchor of [...anchors, { oldIndex: oldMid.length, newIndex: newMid.length }]) {
        for (let index = oldCursor; index < anchor.oldIndex; index += 1)
            out.push({ type: "-", text: oldMid[index], oldLine: prefix + index + 1, newLine: 0 });
        for (let index = newCursor; index < anchor.newIndex; index += 1)
            out.push({ type: "+", text: newMid[index], oldLine: 0, newLine: prefix + index + 1 });
        if (anchor.oldIndex < oldMid.length) {
            out.push({
                type: " ",
                text: oldMid[anchor.oldIndex],
                oldLine: prefix + anchor.oldIndex + 1,
                newLine: prefix + anchor.newIndex + 1,
            });
        }
        oldCursor = anchor.oldIndex + 1;
        newCursor = anchor.newIndex + 1;
    }
    for (let index = suffix; index > 0; index -= 1) {
        const oldIndex = n - index;
        const newIndex = m - index;
        out.push({ type: " ", text: a[oldIndex], oldLine: oldIndex + 1, newLine: newIndex + 1 });
    }
    return out;
}

function uniqueAnchors(oldLines: string[], newLines: string[]): Array<{ oldIndex: number; newIndex: number }> {
    const oldCount = new Map<string, number>();
    const newCount = new Map<string, number>();
    const oldIndex = new Map<string, number>();
    const newIndex = new Map<string, number>();
    for (let index = 0; index < oldLines.length; index += 1) {
        oldCount.set(oldLines[index], (oldCount.get(oldLines[index]) ?? 0) + 1);
        oldIndex.set(oldLines[index], index);
    }
    for (let index = 0; index < newLines.length; index += 1) {
        newCount.set(newLines[index], (newCount.get(newLines[index]) ?? 0) + 1);
        newIndex.set(newLines[index], index);
    }
    const pairs: Array<{ oldIndex: number; newIndex: number }> = [];
    for (const [line, count] of oldCount) {
        if (count !== 1 || newCount.get(line) !== 1)
            continue;
        pairs.push({ oldIndex: oldIndex.get(line)!, newIndex: newIndex.get(line)! });
    }
    pairs.sort((left, right) => left.newIndex - right.newIndex);
    if (pairs.length === 0)
        return [];
    const tails: number[] = [];
    const tailPairs: number[] = [];
    const previous: number[] = new Array(pairs.length).fill(-1);
    for (let index = 0; index < pairs.length; index += 1) {
        const value = pairs[index].oldIndex;
        let low = 0;
        let high = tails.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (tails[mid] < value)
                low = mid + 1;
            else
                high = mid;
        }
        if (low > 0)
            previous[index] = tailPairs[low - 1];
        tails[low] = value;
        tailPairs[low] = index;
    }
    const out: Array<{ oldIndex: number; newIndex: number }> = [];
    let cursor = tailPairs[tails.length - 1];
    while (cursor !== undefined && cursor >= 0) {
        out.push({ oldIndex: pairs[cursor].oldIndex, newIndex: pairs[cursor].newIndex });
        cursor = previous[cursor];
    }
    return out.reverse();
}

function lcs(a: string[], b: string[]): DiffLine[] {
    const n = a.length;
    const m = b.length;
    if (n * m > 4_000_000)
        return fallbackDiff(a, b);
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            dp[i][j] = a[i] === b[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    let oldLine = 1;
    let newLine = 1;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            out.push({ type: " ", text: a[i], oldLine: oldLine++, newLine: newLine++ });
            i += 1;
            j += 1;
        }
        else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ type: "-", text: a[i], oldLine: oldLine++, newLine: 0 });
            i += 1;
        }
        else {
            out.push({ type: "+", text: b[j], oldLine: 0, newLine: newLine++ });
            j += 1;
        }
    }
    while (i < n) {
        out.push({ type: "-", text: a[i], oldLine: oldLine++, newLine: 0 });
        i += 1;
    }
    while (j < m) {
        out.push({ type: "+", text: b[j], oldLine: 0, newLine: newLine++ });
        j += 1;
    }
    return out;
}

export function diffLines(oldContent: string, newContent: string): DiffLine[] {
    const oldSide = splitContent(oldContent);
    const newSide = splitContent(newContent);
    const lines = lcs(oldSide.lines, newSide.lines);
    const oldLast = oldSide.lines.length > 0 ? oldSide.lines[oldSide.lines.length - 1] : undefined;
    const newLast = newSide.lines.length > 0 ? newSide.lines[newSide.lines.length - 1] : undefined;
    const last = lines[lines.length - 1];
    if (oldSide.endsWithNewline !== newSide.endsWithNewline && oldLast === newLast && last?.type === " ") {
        lines.pop();
        lines.push(
            { type: "-", text: oldLast ?? "", oldLine: oldSide.lines.length, newLine: 0 },
            { type: "+", text: newLast ?? "", oldLine: 0, newLine: newSide.lines.length },
        );
    }
    return lines;
}

/** Group changes with three context lines; distant edits become separate hunks. */
export function diffHunks(oldContent: string, newContent: string, context = 3): DiffHunk[] {
    const lines = diffLines(oldContent, newContent);
    const changed = lines.map((line, index) => line.type === " " ? -1 : index).filter((index) => index >= 0);
    if (changed.length === 0)
        return [];
    const ranges: Array<{ start: number; end: number }> = [];
    for (const index of changed) {
        const start = Math.max(0, index - context);
        const end = Math.min(lines.length, index + context + 1);
        const last = ranges[ranges.length - 1];
        if (last && start <= last.end)
            last.end = Math.max(last.end, end);
        else
            ranges.push({ start, end });
    }
    return ranges.map((range) => {
        const oldLines = lines.slice(0, range.start).filter((line) => line.type !== "+").length;
        const newLines = lines.slice(0, range.start).filter((line) => line.type !== "-").length;
        const hunkLines = lines.slice(range.start, range.end);
        return {
            oldStart: oldLines + 1,
            oldCount: hunkLines.filter((line) => line.type !== "+").length,
            newStart: newLines + 1,
            newCount: hunkLines.filter((line) => line.type !== "-").length,
            lines: hunkLines,
        };
    });
}

export function countChangedLines(oldContent: string, newContent: string): number {
    return diffLines(oldContent, newContent).filter((line) => line.type !== " ").length;
}

export function unifiedDiff(oldPath: string | null, newPath: string | null, oldContent: string, newContent: string, kind: "add" | "delete" | "update", context = 3): string {
    const hunks = diffHunks(oldContent, newContent, context);
    const header = kind === "add"
        ? `--- /dev/null\n+++ b/${newPath ?? ""}`
        : kind === "delete"
            ? `--- a/${oldPath ?? ""}\n+++ /dev/null`
            : `--- a/${oldPath ?? ""}\n+++ b/${newPath ?? oldPath ?? ""}`;
    if (hunks.length === 0)
        return header;
    const oldSide = splitContent(oldContent);
    const newSide = splitContent(newContent);
    const body: string[] = [];
    for (const hunk of hunks) {
        body.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
        for (const line of hunk.lines) {
            body.push(line.type + line.text);
            const oldLast = line.type !== "+" && line.oldLine === oldSide.lines.length && !oldSide.endsWithNewline;
            const newLast = line.type !== "-" && line.newLine === newSide.lines.length && !newSide.endsWithNewline;
            if (oldLast || newLast)
                body.push("\\ No newline at end of file");
        }
    }
    return [header, ...body].join("\n");
}
