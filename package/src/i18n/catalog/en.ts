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
export const en = {
    "help.title": "Slash commands \u2014 type any of these at the prompt:",
    "help.footer": "Press ESC to cancel a streaming response. Press Ctrl+C twice to quit.",
    "about.tagline": "FastCode  \u2014 multi-LLM TUI coding assistant",
    "about.platform": "Platform: {platform}  \u00B7  Node {node}",
    "about.github": "GitHub:   {url}",
    "about.skills": "Skills:   configure a registry with /skills registry <url>",
    "status.hint": "/help \u00B7 esc cancel \u00B7 ctrl+c quit",
    "status.hintCompact": "/help \u00B7 esc \u00B7 ctrl+c",
} as const;

export type MessageKey = keyof typeof en;
