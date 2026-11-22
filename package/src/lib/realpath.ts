import { lstatSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";

/**
 * Resolve symlinks component by component, including when the final target is
 * missing. `fs.realpathSync` throws for a dangling symlink, which made callers
 * treat the link as a plain missing path and lose the link target. Returning the
 * resolved target (or the deepest resolvable lexical path) lets sandbox and
 * egress checks see where a write would actually land.
 *
 * Returns undefined on a symlink loop or an unreadable component so callers can
 * fail closed.
 */
const MAX_SYMLINK_DEPTH = 40;

export function realpathOf(input: string): string | undefined {
    try {
        return resolveComponents(resolve(input), 0);
    }
    catch {
        return undefined;
    }
}

function resolveComponents(absolute: string, depth: number): string {
    if (depth > MAX_SYMLINK_DEPTH)
        throw new Error("symlink depth exceeded");
    const root = parse(absolute).root;
    const parts = absolute.slice(root.length).split(sep).filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i += 1) {
        const next = join(current, parts[i]);
        let info;
        try {
            info = lstatSync(next);
        }
        catch (err: any) {
            if (err?.code === "ENOENT" || err?.code === "ENOTDIR")
                return join(current, ...parts.slice(i));
            throw err;
        }
        if (!info.isSymbolicLink()) {
            current = next;
            continue;
        }
        const link = readlinkSync(next);
        const target = isAbsolute(link) ? link : resolve(dirname(next), link);
        const resolvedTarget = resolveComponents(target, depth + 1);
        const rest = parts.slice(i + 1);
        return resolveComponents(rest.length > 0 ? join(resolvedTarget, ...rest) : resolvedTarget, depth + 1);
    }
    return current;
}
