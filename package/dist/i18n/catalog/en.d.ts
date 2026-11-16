/**
 * Base English string catalog.
 *
 * Keys are dotted, stable identifiers. Keep them language-agnostic
 * (`help.title`, not the English sentence) so catalogs stay in sync.
 * `MessageKey` is derived from this object; other locales must implement
 * every key or the build fails.
 *
 * Placeholders use `{name}` and are filled by `t(key, { name })`.
 */
export declare const en: {
    readonly "help.title": "Slash commands — type any of these at the prompt:";
    readonly "help.footer": "Press ESC to cancel a streaming response. Press Ctrl+C twice to quit.";
    readonly "about.tagline": "FastCode  — multi-LLM TUI coding assistant";
    readonly "about.platform": "Platform: {platform}  ·  Node {node}";
    readonly "about.github": "GitHub:   {url}";
    readonly "about.skills": "Skills:   configure a registry with /skills registry <url>";
    readonly "status.hint": "/help · esc cancel · ctrl+c quit";
    readonly "status.hintCompact": "/help · esc · ctrl+c";
};
export type MessageKey = keyof typeof en;
