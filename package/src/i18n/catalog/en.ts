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
    "help.footer": "Press ESC to cancel a streaming response. Press Ctrl+C twice within 3s to quit.",
    "about.tagline": "FastCode  \u2014 multi-LLM TUI coding assistant",
    "about.platform": "Platform: {platform}  \u00B7  Node {node}",
    "about.github": "GitHub:   {url}",
    "about.skills": "Skills:   configure a registry with /skills registry <url>",
    "status.hint": "/help \u00B7 esc cancel \u00B7 ctrl+c x2 (3s) quit",
    "status.hintCompact": "/help \u00B7 esc \u00B7 ctrl+c x2",
    "status.skills": "skills:",
    "banner.subtitle": "multi-LLM TUI \u00B7 skills.sh \u00B7 slash commands \u00B7 /help to start",
    "prompt.placeholder": "Type a message or /help \u2026",
    "prompt.working": "Working\u2026 (Esc to cancel)",
    "message.streaming": "(streaming)",
    "picker.hint": "\u2191/\u2193 select \u00B7 1-9 jump \u00B7 Enter confirm \u00B7 Esc cancel",
    "picker.page": "{start}-{end} of {total}",
    "trust.title": "Trust this folder?",
    "trust.body": "FastCode agent tools can read, write and delete files here, and run shell commands.",
    "trust.warning": "Continue only if you trust this project.",
    "trust.options": "[y] trust and continue    [n] decline (chat only)    [q] quit",
    "activity.streaming": "Streaming",
    "activity.waitingTool": "Waiting for tool",
    "activity.thinking": "Thinking",
    "activity.coding": "Coding: {tool}",
    "app.footer": "{commands} commands \u00B7 {skills} skill(s) active",
} as const;

export type MessageKey = keyof typeof en;
