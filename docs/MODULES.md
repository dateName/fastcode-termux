# 模块职责表

一行一个模块。依赖列只列项目内相对依赖（不含 node 内置与第三方包）。

## bin 与入口

| 文件 | 职责 | 依赖 |
|---|---|---|
| bin/fastcode.mjs | 解析自身路径，用 file URL import 入口；找不到构建产物时报错 | dist/index.js |
| dist/index.js | 入口：先跑 CLI，非 TUI 子命令直接返回；否则校验 TTY 后动态加载 Ink 渲染 App | cli.js, ink, react, app.js |
| dist/types.js | 共享类型占位（编译为空） | 无 |

## 命令行层

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/cli.js | 参数解析；provider/model/config/skills/doctor/update 子命令 | skills/manager, config/store, config/paths, providers/index, lib/diagnostics |

## 界面层

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/app.js | TUI 主组件：配置状态、聊天循环、工具执行、斜杠命令分发、Ctrl+C/Esc 处理 | 见下方各层 |
| dist/ui/Banner.js | 启动大字横幅（稳定 UI 下不动画） | 无 |
| dist/ui/Message.js | 单条消息气泡，Markdown 渲染 | lib/markdown |
| dist/ui/Prompt.js | 底部输入框与斜杠自动补全 | commands/index |
| dist/ui/Spinner.js | 思考动画（稳定 UI 下静止） | 无 |
| dist/ui/StatusBar.js | 状态栏：服务商/模型/用量/平台 | lib/platform |

## 领域层：服务商

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/providers/index.js | 注册表：PROVIDERS、getProvider、getProviderOrThrow | 各 provider |
| dist/providers/openaiCompatible.js | 共享实现：流式 chat/completions、方言自适应重试、模型列表合并 | lib/http |
| dist/providers/anthropic.js | Claude Messages API（独立实现） | lib/http |
| dist/providers/openai.js | OpenAI | openaiCompatible |
| dist/providers/google.js | Google Gemini（OpenAI 兼容端点） | openaiCompatible |
| dist/providers/deepseek.js | DeepSeek | openaiCompatible |
| dist/providers/openrouter.js | OpenRouter（含附加请求头） | openaiCompatible |
| dist/providers/groq.js | Groq | openaiCompatible |
| dist/providers/mistral.js | Mistral | openaiCompatible |
| dist/providers/xai.js | xAI Grok | openaiCompatible |
| dist/providers/moonshot.js | Moonshot Kimi | openaiCompatible |
| dist/providers/zhipu.js | 智谱 GLM | openaiCompatible |
| dist/providers/qwen.js | 通义千问 DashScope | openaiCompatible |
| dist/providers/ollama.js | 本地 Ollama | openaiCompatible |
| dist/providers/custom.js | 任意 OpenAI 兼容端点（环境变量配置） | openaiCompatible |

## 领域层：agent

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/agent/protocol.js | 工具调用标记的解析/剥离/回填；AGENT_SYSTEM_PROMPT | 无 |
| dist/agent/limits.js | 统一的工具输出上限（边产边截断的 OutputBuffer） | 无 |
| dist/agent/guards.js | 危险命令拦截（deny/allow/工作区限制） | 无 |
| dist/agent/tools.js | 本地工具执行与沙箱校验；容错遍历 walk() | 无 |

## 领域层：命令

| 文件 | 职责 |
|---|---|
| dist/commands/index.js | 命令注册表 COMMANDS、findCommand、parseSlash |
| about / cwd / clear / exit / help | 基本信息与退出 |
| agent / tools | agent 模式与工具说明 |
| model / provider / login / logout / whoami | 模型与服务商、密钥 |
| skills / plugin | 技能与插件管理 |
| theme / system / config / reset / cost | 外观、系统提示、配置、用量 |

## 领域层：技能与插件

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/skills/manager.js | 列出/安装/卸载技能；拼装技能 system 提示 | config/paths, lib/http, skills/parser |
| dist/skills/parser.js | SKILL.md frontmatter 解析 | 无 |
| dist/plugins/manager.js | 插件发现/导入/移除；拼装插件提示 | config/paths |

## 基础层

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/config/paths.js | 目录布局、目录创建、密钥文件 0600 | lib/platform |
| dist/config/store.js | config.json / auth.json 读写；密钥解析；原子写入 | paths, themes |
| dist/config/themes.js | 内置配色主题 | 无 |
| dist/config/trust.js | 项目信任列表（trusted.json 读写） | config/paths |
| dist/session/log.js | JSONL 会话落盘、恢复、缓存上限剪枝 | config/paths |
| dist/ui/TrustGate.js | 首次进入目录的信任确认界面 | ink |
| dist/lib/http.js | fetch 封装、SSE 解析（兼容 CRLF） | 无 |
| dist/lib/markdown.js | Markdown 渲染为终端 ANSI | marked, marked-terminal |
| dist/lib/platform.js | 平台/Termux 识别与标签 | 无 |
| dist/lib/uiMode.js | 稳定 UI 判定 | platform |
| dist/lib/startup.js | 欢迎语与缺 Key 提示 | config/store, providers/index |
| dist/lib/diagnostics.js | fastcode doctor 的采集与格式化 | platform, uiMode, paths, store, providers, skills, plugins |
