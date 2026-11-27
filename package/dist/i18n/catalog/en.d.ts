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
    readonly "help.footer": "Press ESC to cancel a streaming response. Press Ctrl+C twice within 3s to quit.";
    readonly "about.tagline": "FastCode  — multi-LLM TUI coding assistant";
    readonly "about.platform": "Platform: {platform}  ·  Node {node}";
    readonly "about.github": "GitHub:   {url}";
    readonly "about.skills": "Skills:   configure a registry with /skills registry <url>";
    readonly "status.hint": "/help · esc cancel · ctrl+c x2 (3s) quit";
    readonly "status.hintCompact": "/help · esc · ctrl+c x2";
    readonly "status.skills": "skills:";
    readonly "banner.subtitle": "multi-LLM TUI · skills.sh · slash commands · /help to start";
    readonly "prompt.placeholder": "Type a message or /help …";
    readonly "prompt.working": "Working… (Esc to cancel)";
    readonly "message.streaming": "(streaming)";
    readonly "picker.hint": "↑/↓ select · 1-9 jump · Enter confirm · Esc cancel";
    readonly "picker.page": "{start}-{end} of {total}";
    readonly "trust.title": "Trust this folder?";
    readonly "trust.body": "FastCode agent tools can read, write and delete files here, and run shell commands.";
    readonly "trust.warning": "Continue only if you trust this project.";
    readonly "trust.options": "[y] trust and continue    [n] decline (chat only)    [q] quit";
    readonly "activity.streaming": "Streaming";
    readonly "activity.waitingTool": "Waiting for tool";
    readonly "activity.thinking": "Thinking";
    readonly "activity.coding": "Coding: {tool}";
    readonly "app.footer": "{commands} commands · {skills} skill(s) active";
};
export type MessageKey = keyof typeof en;
