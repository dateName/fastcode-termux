# 模块职责表

一行一个模块。依赖列只列项目内相对依赖（不含 node 内置与第三方包）。

## bin 与入口

| 文件 | 职责 | 依赖 |
|---|---|---|
| bin/fastcode.mjs | 解析自身路径，**优先 import 自包含打包产物 dist/cli.js**，回退 dist/index.js，再回退 src/index.ts（tsx）；捕获 ERR_MODULE_NOT_FOUND 时打印友好修复指引 | dist/cli.js, dist/index.js, src/index.ts |
| dist/cli.js | **esbuild 自包含单文件**（内联 Ink/React/meow/cfonts 字体等）：既是可直接执行的入口，也是完整的 CLI + TUI；带 `#!/usr/bin/env node` 与 createRequire 垫片 | 无（内置依赖） |
| dist/index.js | tsc 编译入口（备用路径）：先跑 CLI，非 TUI 子命令直接返回；否则校验 TTY 后动态加载 Ink 渲染 App | cli.js, ink, react, app.js |
| dist/types.js | 共享类型占位（编译为空） | 无 |

## 命令行层

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/cli.js | 参数解析；provider/model/config/skills/doctor/update 子命令 | skills/manager, config/store, config/paths, providers/index, lib/diagnostics |

## 界面层

| 文件 | 职责 | 依赖 |
|---|---|---|
| dist/app.js | TUI 主组件：配置状态、聊天循环（runStream + 压缩）、工具执行、斜杠命令/选择器分发、Ctrl+C/Esc 处理 | 见下方各层 |
| dist/ui/Banner.js | 启动大字横幅（稳定 UI 下不动画） | 无 |
| dist/ui/Message.js | 单条消息气泡，Markdown 渲染 | lib/markdown |
| dist/ui/Prompt.js | 底部输入框与斜杠自动补全 | commands/index |
| dist/ui/Spinner.js | 思考动画（stable 模式 120ms 低频，仍转动） | 无 |
| dist/ui/Picker.js | 交互列表：窗口化、编号、当前项高亮（/model、/provider、/effort 复用） | 无 |
| dist/ui/StatusBar.js | 状态栏：服务商/模型/用量/effort/平台 | lib/platform |

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
| dist/agent/tools.js | 本地工具执行与沙箱校验；目录摘要、读取/搜索上限；容错遍历 walk() | config/store, ignore |
| dist/agent/stream.js | 流式请求：空闲超时、零输出重试、断流识别 | types |
| dist/agent/context.js | 历史压缩：保留首条+最近消息，摘要中段 | types |
| dist/agent/ignore.js | 默认忽略项 + .fastcodeignore 规则、二进制识别 | 无 |

## 领域层：命令

| 文件 | 职责 |
|---|---|
| dist/commands/index.js | 命令注册表 COMMANDS、findCommand、parseSlash |
| about / cwd / clear / exit / help | 基本信息与退出 |
| agent / tools | agent 模式与工具说明 |
| model / provider | 交互选择器（联网合并 + 离线标注）；保留 /model <id> 直接切换 |
| effort | 思考强度选择器（auto/low/medium/high/max） |
| login / logout / whoami | 引导式 Key 绑定（服务商 → 模型 → Key，掩码输入）与 provider 级登出 |
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
| dist/config/store.js | config.json / auth.json 读写；**按 provider 保存/解析 Key**（v3）；v1/v2 自动迁移并备份；maskKey；原子写入 | paths, themes |
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
| dist/lib/pkg.js | 读取 package.json 的 name/version（对 bundle / tsc / tsx 三种路径都健壮） | 无 |

## 构建与分发（仓库根：scripts/、.github/）

| 文件 | 职责 | 依赖 |
|---|---|---|
| package/scripts/build.mjs | esbuild 打包：src/index.ts -> dist/cli.js（自包含、可提交），node 内置模块 external | esbuild, esbuild-plugins.mjs |
| package/scripts/esbuild-plugins.mjs | 打包插件：桩掉 react-devtools-core；**内联 cfonts 全部字体**（修复大字横幅消失）；注入 createRequire banner（修复 CJS require） | node:fs |
| scripts/install.sh | 一键安装：把 dist/cli.js 软链到 $PREFIX/bin（有产物则免 npm install） | 无 |
| scripts/install-termux.sh | install.sh 的兼容薄封装 | install.sh |
| scripts/build-portable.sh | 生成 release/ 便携包 tar.gz/zip + npm pack .tgz + SHA256SUMS | 无 |
| scripts/update-termux.sh | 更新脚本（目录 / git / npm） | 无 |
| scripts/smoke-test.mjs | 自检（provider 级 Key、迁移、沙箱越界、SSE 换行、配置与密钥分离等） | 无 |
| .github/workflows/release.yml | 打 v* tag 时自动构建并上传 GitHub Release | 无 |
