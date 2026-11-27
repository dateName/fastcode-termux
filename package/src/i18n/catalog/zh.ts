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
    "help.footer": "按 ESC 取消流式响应；3 秒内连按两次 Ctrl+C 退出。",
    "about.tagline": "FastCode —— 多模型 TUI 编程助手",
    "about.platform": "平台：{platform}  ·  Node {node}",
    "about.github": "GitHub：  {url}",
    "about.skills": "技能：    用 /skills registry <url> 配置市场",
    "status.hint": "/help · esc 取消 · 3 秒内 ctrl+c 两次退出",
    "status.hintCompact": "/help · esc · ctrl+c x2",
    "status.skills": "技能:",
    "banner.subtitle": "多模型 TUI · skills.sh · 斜杠命令 · /help 开始",
    "prompt.placeholder": "输入消息或 /help …",
    "prompt.working": "处理中…（Esc 取消）",
    "message.streaming": "（生成中）",
    "picker.hint": "↑/↓ 选择 · 1-9 跳转 · Enter 确认 · Esc 取消",
    "picker.page": "{start}-{end} / {total}",
    "trust.title": "信任此目录？",
    "trust.body": "FastCode agent 工具可在此读取、写入、删除文件并执行 shell 命令。",
    "trust.warning": "仅在你信任该项目时继续。",
    "trust.options": "[y] 信任并继续    [n] 拒绝（仅聊天）    [q] 退出",
    "activity.streaming": "输出中",
    "activity.waitingTool": "等待工具",
    "activity.thinking": "思考中",
    "activity.coding": "执行工具：{tool}",
    "app.footer": "{commands} 条命令 · {skills} 个技能启用",
};
