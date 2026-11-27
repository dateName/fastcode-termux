/**
 * Filesystem layout for FastCode user data.
 *
 *   ~/.fastcode/
 *     config.json       global preferences (provider, model, theme, …)
 *     auth.json         per-provider API keys (mode 0600)
 *     skills/           installed SKILL.md folders
 *     plugins/          installed plugin folders
 *     cache/            transient downloads & registry caches
 *     sessions/         conversation transcripts (future)
 *     logs/             debug logs (future)
 *
 * On Windows we keep using `~/.fastcode` rather than %APPDATA% to match the
 * dotfile convention most TUIs use; users can override via $FASTCODE_HOME.
 */
import { join } from "node:path";
import { mkdirSync, existsSync, chmodSync } from "node:fs";
import { safeHome, isWindows } from "../lib/platform.js";
let cached;
export function getPaths() {
    if (cached)
        return cached;
    const root = process.env["FASTCODE_HOME"] ?? join(safeHome(), ".fastcode");
    const paths = {
        root,
        config: join(root, "config.json"),
        auth: join(root, "auth.json"),
        trust: join(root, "trusted.json"),
        skills: join(root, "skills"),
        plugins: join(root, "plugins"),
        cache: join(root, "cache"),
        sessions: join(root, "sessions"),
        logs: join(root, "logs"),
        hooks: join(root, "hooks"),
    };
    ensureDir(paths.root);
    ensureDir(paths.skills);
    ensureDir(paths.plugins);
    ensureDir(paths.cache);
    ensureDir(paths.sessions);
    ensureDir(paths.logs);
    // hooks is intentionally lazy: do NOT create it here. The H1 hook host
    // starts only when wiring sees *.mjs files; an absent dir means "no hooks".
    // state/ is reserved for H2 and intentionally not created or exposed:
    // sessions/ remains the authoritative logPath root; logs/ is debug-only.
    cached = paths;
    return paths;
}
export function ensureDir(dir, mode = 0o700) {
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true, mode });
    // mkdirSync's mode is masked by umask; enforce it on POSIX so the data
    // directory is consistently 0700 instead of inheriting 0755.
    if (!isWindows()) {
        try {
            chmodSync(dir, mode);
        }
        catch {
            // FAT / shared storage may not honor chmod; best effort.
        }
    }
}
/** Tighten permissions on a file storing secrets where the OS supports it. */
export function lockdown(file) {
    if (isWindows())
        return true;
    try {
        chmodSync(file, 0o600);
        return true;
    }
    catch {
        // best effort; some filesystems (FAT, Termux on internal storage) don't
        // honor chmod and that's fine.
        return false;
    }
}
