/**
 * Simplified Chinese catalog.
 *
 * Typed as `Record<MessageKey, string>` so a missing or renamed key is a
 * compile-time error. Add new locales the same way and register them in
 * `src/i18n/index.ts`.
 */
import type { MessageKey } from "./en.js";

export const zh: Record<MessageKey, string> = {
    "help.title": "斜杠命令 —— 在提示符输入以下任一命令：",
    "help.footer": "按 ESC 取消流式响应，连按两次 Ctrl+C 退出。",
    "about.tagline": "FastCode —— 多模型 TUI 编程助手",
    "about.platform": "平台：{platform}  ·  Node {node}",
    "about.github": "GitHub：  {url}",
    "about.skills": "技能：    用 /skills registry <url> 配置市场",
    "status.hint": "/help · esc 取消 · ctrl+c 退出",
    "status.hintCompact": "/help · esc · ctrl+c",
};
