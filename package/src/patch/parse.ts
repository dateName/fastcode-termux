export type PatchLineType = " " | "-" | "+";

export interface PatchLine {
    type: PatchLineType;
    text: string;
}

export interface PatchHunk {
    lines: PatchLine[];
}

export type PatchOp =
    | { kind: "add"; path: string; lines: string[] }
    | { kind: "delete"; path: string }
    | { kind: "update"; path: string; hunks: PatchHunk[]; moveTo?: string };

export type ParseResult = { ok: true; ops: PatchOp[] } | { ok: false; output: string };

export function parsePatch(patch: string): ParseResult {
    const lines = String(patch ?? "").split(/\r?\n/);
    if (lines[0] !== "*** Begin Patch")
        return fail("patch must start with *** Begin Patch");
    const ops: PatchOp[] = [];
    const seen = new Set<string>();
    const claim = (path: string): string | undefined => {
        if (!path)
            return "empty file path in patch";
        if (seen.has(path))
            return `duplicate file in patch: ${path}`;
        seen.add(path);
        return undefined;
    };
    let i = 1;
    let foundEnd = false;
    while (i < lines.length) {
        const line = lines[i];
        if (line === "*** End Patch") {
            foundEnd = true;
            i += 1;
            break;
        }
        if (line === "" || line === undefined) {
            i += 1;
            continue;
        }
        if (line.startsWith("*** Add File: ")) {
            const path = line.slice("*** Add File: ".length).trim();
            const duplicate = claim(path);
            if (duplicate)
                return fail(duplicate);
            i += 1;
            const content: string[] = [];
            while (i < lines.length && !lines[i].startsWith("*** ")) {
                const row = lines[i];
                if (row === "") {
                    content.push("");
                    i += 1;
                    continue;
                }
                if (!row.startsWith("+"))
                    return fail(`Add File body must start with '+': ${row}`);
                content.push(row.slice(1));
                i += 1;
            }
            ops.push({ kind: "add", path, lines: content });
            continue;
        }
        if (line.startsWith("*** Delete File: ")) {
            const path = line.slice("*** Delete File: ".length).trim();
            const duplicate = claim(path);
            if (duplicate)
                return fail(duplicate);
            ops.push({ kind: "delete", path });
            i += 1;
            continue;
        }
        if (line.startsWith("*** Update File: ")) {
            const path = line.slice("*** Update File: ".length).trim();
            const duplicate = claim(path);
            if (duplicate)
                return fail(duplicate);
            i += 1;
            let moveTo: string | undefined;
            if (i < lines.length && lines[i].startsWith("*** Move to: ")) {
                moveTo = lines[i].slice("*** Move to: ".length).trim();
                const movedDuplicate = claim(moveTo);
                if (movedDuplicate)
                    return fail(movedDuplicate);
                i += 1;
            }
            const hunks: PatchHunk[] = [];
            let current: PatchHunk | undefined;
            while (i < lines.length && !lines[i].startsWith("*** ")) {
                const row = lines[i];
                if (row === "") {
                    i += 1;
                    continue;
                }
                if (row.startsWith("@@")) {
                    current = { lines: [] };
                    hunks.push(current);
                    i += 1;
                    continue;
                }
                const type = row[0];
                if (type !== " " && type !== "-" && type !== "+")
                    return fail(`invalid hunk line (must start with ' ', '-', or '+'): ${row}`);
                if (!current) {
                    current = { lines: [] };
                    hunks.push(current);
                }
                current.lines.push({ type: type as PatchLineType, text: row.slice(1) });
                i += 1;
            }
            if (hunks.length === 0 && !moveTo)
                return fail(`Update File has no hunks: ${path}`);
            ops.push({ kind: "update", path, hunks, moveTo });
            continue;
        }
        return fail(`unsupported patch directive: ${line}`);
    }
    if (!foundEnd)
        return fail("patch must end with *** End Patch");
    if (ops.length === 0)
        return fail("patch contains no file operations");
    return { ok: true, ops };
}

function fail(output: string): ParseResult {
    return { ok: false, output };
}
