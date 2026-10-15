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
    };
    ensureDir(paths.root);
    ensureDir(paths.skills);
    ensureDir(paths.plugins);
    ensureDir(paths.cache);
    ensureDir(paths.sessions);
    ensureDir(paths.logs);
    cached = paths;
    return paths;
}
export function ensureDir(dir) {
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
/** Tighten permissions on a file storing secrets where the OS supports it. */
export function lockdown(file) {
    if (isWindows())
        return;
    try {
        chmodSync(file, 0o600);
    }
    catch {
        // best effort; some filesystems (FAT, Termux on internal storage) don't
        // honor chmod and that's fine.
    }
}
