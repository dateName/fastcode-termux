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
    const base = resolve(process.env["FASTCODE_WORKTREES_ROOT"] ?? join(getPaths().root, "worktrees"));
    const target = join(base, basename(root), clean);
    if (existsSync(target))
        throw new Error(`worktree already exists: ${target}`);
    mkdirSync(join(base, basename(root)), { recursive: true });
    const baseCommit = git(root, ["rev-parse", "HEAD"]).trim();
    const branch = `wt/${clean}`;
    git(root, ["worktree", "add", "-b", branch, target, baseCommit]);
    git(target, ["config", "fastcode.base", baseCommit]);
    return { path: target, branch };
}
function worktreeBase(path) {
    try {
        const configured = git(path, ["config", "--get", "fastcode.base"]).trim();
        if (configured)
            return configured;
    }
    catch {
        // Older worktrees do not have the recorded base.
    }
    for (const branch of ["main", "master"]) {
        try {
            return git(path, ["merge-base", "HEAD", branch]).trim();
        }
        catch {
            // try the next likely base
        }
    }
    try {
        return git(path, ["rev-parse", "HEAD~1"]).trim();
    }
    catch {
        return git(path, ["rev-list", "--max-parents=0", "HEAD"]).trim();
    }
}
function lastAppliedBase(root) {
    try {
        const value = git(root, ["config", "--get", "fastcode.lastApplied"]).trim();
        return value || undefined;
    }
    catch {
        return undefined;
    }
}
export function worktreeDiff(path) {
    const root = worktreeRootFor(path);
    const base = worktreeBase(root);
    return {
        status: git(root, ["status", "--porcelain"]),
        diff: git(root, ["diff", base, "--binary"]),
    };
}
export function applyWorktree(cwd, path, options = {}) {
    const root = worktreeRootFor(cwd);
    const source = worktreeRootFor(path);
    const targetStatus = git(root, ["status", "--porcelain"]);
    if (targetStatus.trim())
        return { applied: false, output: `target checkout has uncommitted changes; apply skipped:\n${targetStatus.trim()}\nCommit them first; use --commit on the first apply to let FastCode commit it.` };
    const base = lastAppliedBase(root) ?? worktreeBase(source);
    const diff = git(source, ["diff", base, "--binary"]);
    const status = git(source, ["status", "--porcelain"]);
    if (!diff.trim())
        return { applied: false, output: status.trim() ? `no tracked diff; untracked/uncommitted status:\n${status.trim()}` : "worktree has no changes" };
    git(root, ["apply", "--whitespace=nowarn", "-"], { input: diff });
    const snapshot = git(source, ["stash", "create", "fastcode apply"]).trim() || git(source, ["rev-parse", "HEAD"]).trim();
    git(root, ["config", "fastcode.lastApplied", snapshot]);
    const untracked = status.split(/\r?\n/).filter((line) => line.startsWith("??")).join("\n");
    let commitNote = "";
    if (options.commit) {
        try {
            git(root, ["add", "-A"]);
            git(root, ["commit", "-m", `fastcode: apply worktree ${basename(source)}`]);
            commitNote = "\ncommitted applied changes";
        }
        catch (err) {
            commitNote = `\napply succeeded but commit failed: ${err?.message ?? String(err)}`;
        }
    }
    return {
        applied: true,
        output: `applied worktree diff to ${root}` + commitNote + (untracked ? `\nuntracked files not applied:\n${untracked}` : ""),
    };
}
export function removeWorktree(cwd, path, force = false) {
    const root = worktreeRootFor(cwd);
    const dirty = git(worktreeRootFor(path), ["status", "--porcelain"]).trim();
    if (dirty && !force)
        throw new Error("worktree has uncommitted changes; review/apply them or pass --force to discard");
    git(root, ["worktree", "remove", ...(force ? ["--force"] : []), path]);
}
