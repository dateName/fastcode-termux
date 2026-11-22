import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getPaths } from "../config/paths.js";
function git(cwd, args, options = {}) {
    try {
        return execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
            ...options,
        });
    }
    catch (err) {
        const detail = String(err?.stderr ?? err?.message ?? err).trim();
        throw new Error(`git ${args.join(" ")} failed: ${detail}`);
    }
}
export function worktreeRootFor(cwd) {
    const root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
    if (!root)
        throw new Error("not a git repository");
    return resolve(root);
}
export function listWorktrees(cwd) {
    const root = worktreeRootFor(cwd);
    const out = git(root, ["worktree", "list", "--porcelain"]);
    const entries = [];
    let current;
    for (const line of out.split(/\r?\n/)) {
        if (!line.trim()) {
            if (current) {
                entries.push(current);
                current = undefined;
            }
            continue;
        }
        if (line.startsWith("worktree ")) {
            if (current)
                entries.push(current);
            current = { path: line.slice("worktree ".length) };
        }
        else if (current && line.startsWith("HEAD ")) {
            current.head = line.slice("HEAD ".length);
        }
        else if (current && line.startsWith("branch ")) {
            current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
        }
        else if (current && line === "detached") {
            current.detached = true;
        }
        else if (current && line === "bare") {
            current.bare = true;
        }
    }
    if (current)
        entries.push(current);
    return entries;
}
export function createWorktree(cwd, slug) {
    const root = worktreeRootFor(cwd);
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean || clean.includes(".."))
        throw new Error("worktree slug must contain letters, numbers, '.', '_' or '-'");
    const base = process.env["FASTCODE_WORKTREES_ROOT"] ?? join(getPaths().root, "worktrees");
    const target = join(base, basename(root), clean);
    if (existsSync(target))
        throw new Error(`worktree already exists: ${target}`);
    mkdirSync(join(base, basename(root)), { recursive: true });
    const branch = `wt/${clean}`;
    git(root, ["worktree", "add", "-b", branch, target, "HEAD"]);
    return { path: target, branch };
}
export function worktreeDiff(path) {
    const root = worktreeRootFor(path);
    return {
        status: git(root, ["status", "--porcelain"]),
        diff: git(root, ["diff", "HEAD"]),
    };
}
export function applyWorktree(cwd, path) {
    const root = worktreeRootFor(cwd);
    const source = worktreeRootFor(path);
    const targetStatus = git(root, ["status", "--porcelain"]);
    if (targetStatus.trim())
        return { applied: false, output: `target checkout has uncommitted changes; apply skipped:\n${targetStatus.trim()}` };
    const diff = git(source, ["diff", "HEAD", "--binary"]);
    const status = git(source, ["status", "--porcelain"]);
    if (!diff.trim())
        return { applied: false, output: status.trim() ? `no tracked diff; untracked/uncommitted status:\n${status.trim()}` : "worktree has no changes" };
    git(root, ["apply", "--whitespace=nowarn", "-"], { input: diff });
    return {
        applied: true,
        output: `applied tracked diff to ${root}` + (status.trim() ? `\nuntracked/other status not applied:\n${status.trim()}` : ""),
    };
}
export function removeWorktree(cwd, path, force = false) {
    const root = worktreeRootFor(cwd);
    const dirty = git(worktreeRootFor(path), ["status", "--porcelain"]).trim();
    if (dirty && !force)
        throw new Error("worktree has uncommitted changes; review/apply them or pass --force to discard");
    git(root, ["worktree", "remove", ...(force ? ["--force"] : []), path]);
}
