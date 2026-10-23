# FastCode 0.1.3 → 0.1.6 修复清单

基线：npm 包 @simplelittledev/fastcode 0.1.3（本项目 package/ 内的已编译产物）。
前 14 项直接作用于 package/dist 的编译 JS；第 15 项起已由 dist 逆向重建 TypeScript 源码树
（package/src 成为唯一事实来源，dist 由 `tsc + esbuild` 重新生成）。

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 1 | bin/fastcode.mjs | await import(绝对路径) 在 Windows 上抛出 ERR_UNSUPPORTED_ESM_URL_SCHEME，启动即失败 | 改用 pathToFileURL(...).href（dist 与 src 两个分支） |
| 2 | dist/index.js | Ink 默认 exitOnCtrlC 为 true，单按 Ctrl+C 直接退出，App 里的“再按一次退出”永远不触发 | render(..., { exitOnCtrlC: false }) 交由应用处理 |
| 3 | dist/lib/http.js | SSE 分帧只识别 LF 空行，遇到 CRLF 空行（含跨 chunk 情况）无法切分，流式回复会粘连或卡住 | 先把缓冲区 CRLF/CR 归一化为 LF，再按空行分帧 |
| 4 | dist/app.js | 斜杠命令回显原始输入，/login 会把 API Key 明文写进对话 | login 的参数回显打码为 ******** |
| 5 | dist/lib/platform.js | Termux 判断要求 PREFIX 目录存在，部分环境误判为非 Termux，导致不启用稳定 UI | 同时识别 TERMUX_VERSION，不再强制目录存在 |
| 6 | dist/app.js | runSlash 的 useCallback 依赖数组缺少 agentMode、enabledPlugins、skillsRegistry，斜杠命令读到过期状态 | 补齐依赖项 |
| 7 | dist/lib/diagnostics.js、dist/cli.js | 缺少部署自检与更新入口 | 新增 fastcode doctor 和 fastcode update |
| 8 | package.json | 版本号 | 0.1.3 → 0.1.6 |
| 9 | dist/agent/tools.js | walk() 对每个条目 stat()（跟随软链接），悬空软链接抛 ENOENT 使 grep / list_files 整次失败；且会经软链接扫出沙箱（如 Termux /storage/emulated/0） | stat/readdir/visit 逐项容错；有效软链接仍遍历；越出沙箱根的软链接不深入；按祖先链检测软链接环；5000 条上限 |
| 10 | dist/providers/openaiCompatible.js | 新版模型（o 系列 / GPT-5+）拒绝 max_tokens 与 temperature，请求 400，表现为“无法识别最新主流模型” | 首次请求失败且报参数错误时，自动用 max_completion_tokens 且不带 temperature 重试一次 |
| 11 | dist/providers/openaiCompatible.js | /models 实时列表只返回 id，丢失标签与价格；且内置列表不全会盖掉实时结果 | 实时列表与内置元数据合并，内置未返回的模型保留 |
| 12 | dist/providers/*、providers/index.js | 仅 8 个服务商，模型清单陈旧 | 新增 xAI(Grok)、Moonshot(Kimi)、Zhipu(GLM)、Qwen(DashScope)、Custom(OpenAI 兼容)；刷新各服务商默认模型 |
| 13 | dist/cli.js、dist/lib/diagnostics.js | Termux 下不想开 TUI 只想改配置；config 与 key 的分离不够直观 | 新增 fastcode provider / model / config 子命令，直接读写 config.json 且绝不触碰 auth.json；doctor 分别打印 config 文件与 keys 文件路径 |
| 14 | docs/*、scripts/*、release/ | 缺架构文档、缺免安装部署方式、缺可复现的构建与自检 | 新增 docs/ARCHITECTURE、MODULES、CONFIGURATION、DEPLOYMENT；新增 scripts/build-portable.sh（一键出行便携包）与 scripts/smoke-test.mjs（自检全部通过）；产出免安装便携包 tar.gz/zip |
| 15 | src/*、tsconfig.json | 只有编译产物，无法维护、审计与升级 | 由 dist 逆向重建 58 个模块到 src/*.ts，types.ts 恢复真实接口；新增 tsconfig.json；tsc 编译零错误，dist 改由 src 生成 |
| 16 | src/agent/tools.ts、scripts/smoke-test.mjs | 沙箱可经软链接逃逸（高危）：沙箱内软链接指向外部时 read/write/delete 可越界 | sandboxPath 增加真实路径校验（解析最深已存在祖先再比对）；smoke 增加软链接越界与越界写入用例 |
| 17 | docs/AUDIT.md | 缺少安全与健壮性审计记录 | 新增审计报告：1 高危已修、2 中危已修、2 中危与 4 低危待办，含复现与建议 |
| 18 | src/agent/tools.ts、docs/CONFIGURATION.md | 沙箱过严：Termux 下无法访问 ~/storage/shared，手机上的项目/下载用不了 | 引入“允许根目录”：Termux 默认放行 ~/storage/shared，支持 FASTCODE_ALLOW_PATHS 扩展、FASTCODE_ALLOW_SHARED_STORAGE=0 关闭；判定以真实路径为准 |
| 19 | src/agent/limits.ts、src/agent/tools.ts、src/agent/protocol.ts | 工具输出上限散落多处（shell 20000、fence 12000、列表 1000 行），且是事后 slice，内存不受控 | 新增统一的 OutputBuffer：边产边截断、head/tail 两种模式、明确标注省略量；一个上限贯穿 shell、grep、list_files、结果封装，可用 FASTCODE_TOOL_OUTPUT_LIMIT 调整 |
| 20 | src/session/log.ts、src/app.ts、src/cli.ts | 会话只在内存，崩溃即全丢 | JSONL 逐行追加落盘到 ~/.fastcode/sessions，新增 fastcode sessions/resume 与 TUI 恢复；缓存上限默认 256MB，可用 FASTCODE_SESSION_CACHE_MB 调整，超出先删最旧 |
| 21 | src/config/trust.ts、src/ui/TrustGate.ts、src/cli.ts | 在陌生目录直接启用 agent 工具，无确认 | 项目信任机制：首次进入目录弹出确认，信任列表存 ~/.fastcode/trusted.json，新增 fastcode trust/untrust/trusted，FASTCODE_TRUST_ALL=1 可跳过 |
| 22 | src/agent/guards.ts、src/agent/tools.ts | shell 工具可执行任意破坏性命令 | 内置危险命令 deny 列表（rm -rf / del /f / rmdir /s / format|mkfs|diskpart / dd if= / 写 /dev/sd / shutdown|reboot|poweroff / fork bomb），执行前拦截；支持 allowlist、追加规则与 FASTCODE_ALLOW_DANGEROUS 放行 |
| 23 | package/scripts/build.mjs、esbuild、package/dist/cli.js | `git clone` 后直接运行报 ERR_MODULE_NOT_FOUND（依赖未安装） | 用 esbuild 把全部依赖打包成自包含单文件 dist/cli.js 并**提交进 Git**；bin/fastcode.mjs 优先加载它，缺依赖时给友好指引；`git clone` 后免 npm install |
| 24 | package/scripts/esbuild-plugins.mjs | 打包后启动时的大字横幅（ink-big-text）消失 | cfonts 用动态 require 读字体，打包后失败而静默返回 false；构建时把 cfonts/fonts/*.json 内联成静态映射 |
| 25 | package/scripts/esbuild-plugins.mjs | 打包后 CJS 依赖（supports-color）调用 require('os') 抛 "Dynamic require ... is not supported" | 注入 createRequire banner，为 ESM 产物提供真实 require |
| 26 | package/src/lib/pkg.ts、src/cli.ts、src/lib/diagnostics.ts | 打包后 import.meta.url 变化，版本读取失败，doctor 显示 0.0.0 | 新增 readPackageMeta()，对 bundle / tsc / tsx 三种路径逐一尝试 |
| 27 | package/src/session/log.ts | 会话缓存上限默认偏小 | 默认 64MB → 256MB（仍可用 FASTCODE_SESSION_CACHE_MB 调整） |
| 28 | scripts/install.sh、scripts/install-termux.sh、.github/workflows/release.yml、.gitattributes、scripts/build-portable.sh | 缺真正可用的一键安装 / 自动发布 / 换行一致 | install.sh 改为把 dist/cli.js 软链到 PATH（有产物免 npm）；install-termux.sh 变薄封装；新增 CI 打 tag 自动发 Release；build-portable.sh 产出 tar.gz/zip + npm pack + SHA256SUMS；.gitattributes 统一 LF |
| 29 | src/app.ts、src/ui/Banner.ts | 启动大字横幅仅在终端 ≥88 列时显示，手机竖屏（Termux 约 56 列）看不到 | 按终端宽度自适应选字体（block 74 / simple 56 / slick 49 / shade 39 / chrome 32 / console 16 列），都放不下才不显示；真机（LG V40，35×56）已验证横幅正常且不换行 |
| 30 | src/config/store.ts、src/lib/*、src/commands/* | API Key 被当成"服务商级"的单一字符串：首次输入不说明归属哪个服务商/模型，保存后不回显绑定，切换模型时信息错位 | Key 绑定到「服务商 + 模型」：auth.json v2 以 `<provider>::<model>` 作用域保存；resolveApiKey 必须 provider 与 model 同时匹配才使用；新增 maskKey 只回显尾号（sk-****abcd）；旧 provider-only 键识别为 legacy/unbound，绝不静默使用 |
| 31 | src/commands/login.ts、logout.ts、whoami.ts、src/app.ts、src/ui/Prompt.ts | /login 无引导、不回显归属；logout 只能按服务商删 | /login 引导式流程：服务商 → 模型 → Key（输入掩码），无参数时逐步选择；保存后回显 服务商/模型/尾号/文件路径；logout 支持按作用域删除或 `--all`；whoami 列出作用域、legacy 与环境变量；发送前校验当前 provider+model 的 Key，缺失或 unbound 时拦截并给出精确命令 |
| 32 | src/app.ts | 服务商鉴权失败 / 额度用完时报错笼统 | 401/403 提示重新检查或重存 Key；402/429 提示额度/限流并建议充值或切换模型；均带 provider·model 上下文 |
| 33 | docs/CONFIGURATION.md、README.md、README.zh.md | 文档仍描述 provider 级 Key | 更新为「服务商 + 模型」作用域、legacy 迁移、引导式 /login、发送前校验与错误提示 |
| 34 | package/src/providers/openaiCompatible.ts | `/models` 实时列表与内置清单合并时，会把「内置里有、服务商已下架」的模型继续显示，模型选择器长期保留旧模型（如 `deepseek-chat`） | 实时列表视为权威：只显示服务商当前返回的模型（用内置标签/价格补全已知项）；离线或请求失败时才回退内置清单 |
| 35 | package/src/providers/deepseek.ts、package/src/providers/anthropic.ts | 服务商内置/默认模型陈旧（DeepSeek 官方实时只剩 `deepseek-flash`、`deepseek-v4-pro`；Anthropic 从不联网取列表） | DeepSeek 内置与默认更新为 `deepseek-v4-pro`/`deepseek-flash`；Anthropic 的 listModels 改为先查 `/v1/models` 实时列表、失败再回退内置 |
| 36 | package/src/agent/protocol.ts、scripts/smoke-test.mjs | 本地代理只认 `<fastcode_tool>`；DeepSeek 等模型会改用原生 DSML 标记（`<｜DSML｜invoke …>`），导致工具调用被当成普通文本显示、根本不执行 | parseToolCalls/stripToolCalls 增加 DSML 方言：先把 fullwidth/ASCII 竖线标记归一化为普通标签，再解析 calls→invoke→parameter；兼容 `<calls>`/`<tool_calls>`/`<function_calls>`、含不含外层块；smoke 增加 3 项回归 |

## 0.1.6-beta harness 改造（2026-10-23）

> 详细设计与回滚见 `docs/ARCHITECTURE.md`、`docs/DEVLOG.md`；回归见 `docs/RUNBOOK`（外层）与 smoke。
> 提交：`630eae3`、`0bedcb5`、`05f833d`、`1e746cc`、`d64ad0c`、`eb97e22`。

| 主题 | 落点 | 变化 |
|---|---|---|
| runner | `agent/runner.ts` | 无 React async generator；预算/循环/abort/checkpoint 事件 |
| registry | `agent/registry.ts`、`agent/tools/*` | 15 工具单文件；stateScope/revalidate 启动断言 |
| trust | `config/trust.ts` | v1 paths(realpath) + tools；旧 `trusted[]` 迁移；mtime memo |
| approval | `agent/approval.ts`、`registry.approve()` | 三态类型；敏感/大 diff pending；无 resolver 时 fail closed |
| 中断 | `agent/process-tree.ts`、`shell-session.ts` | POSIX 进程组、Windows taskkill /T |
| SSE/retry | `lib/http.ts`、`lib/net.ts` | 25s idle（`FASTCODE_SSE_IDLE_MS`）、前缀去重、QuotaError |
| 恢复 | `session/log.ts`、`session/projection.ts` | checkpoint、事实流、projection fingerprint、未配对 tool_call |
| 压缩 | `agent/compaction.ts` | token/heap 阈值、summary-*.md、server-aware 互斥 |
| 补丁 | `patch/{parse,plan,apply}.ts` | 全量 plan、模糊匹配、CRLF/mode、符号链接、move 不覆盖、diff |
| 后台 shell | `agent/shell-session.ts` | 2s 后台、常驻池、增量轮询、/jobs /kill |
| 双轨协议 | `protocol-mode.ts`、`tool-schemas.ts`、`lib/native-tools.ts` | tool_calls index 归并、400 降级、capabilities |
| 手机 UI | `commands/*`、`app.ts`、`lib/diagnostics.ts` | /cancel /steer /attach /compact /expand /edit；折叠；doctor |
| TUI 修复 | `app.ts`、`ui/Prompt.ts`、`ui/Message.ts` | 60ms 节流、流式限高、Markdown 缓存、可见光标、resize 不吃 memo |

验证：PC smoke 115；Termux 120/120；真实 DeepSeek Flash 文本与工具轮次通过；kill -9、/sdcard fsync、进程组 kill 通过。

## 0.1.6-beta 追加（测试版，GitHub Release + npm 已发布）

> 详细交接说明见 `docs/DEVLOG.md` 与 `LOCALIZATION_REPORT.md`。
> 本组改动相互交叉（`store.ts` / `app.ts` 同时涉及多项），因此合并为一个提交 `0980f2e`。

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 37 | package/src/agent/tools.ts、src/config/store.ts | `apply_patch` 的 `*** Update File:` 直接 `resolve()`，`../` 可越界写文件；额外目录只能靠环境变量 | 补丁目标改走 `sandboxPath()`；新增 `config.sharedDirs`（相对/`~/`/绝对），与 `FASTCODE_ALLOW_PATHS` 合并 |
| 38 | package/src/config/store.ts、commands/login.ts、logout.ts、whoami.ts、app.ts | auth v2 按 `provider::model` 存 Key，换模型需要重输 | auth v3 按 provider 存；v1/v2 自动迁移，保留 `auth.json.v2.bak`；同 provider 多条保留 `addedAt` 最新 |
| 39 | package/src/agent/stream.ts、context.ts、app.ts、config/store.ts | 硬编码 8 轮、无空闲超时、断流当完成、历史无限增长导致 400 截断 | `maxAgentTurns=24`；60s 空闲超时 + 零输出重试；断流标记与“继续”；超 400k 字符压缩中段 |
| 40 | package/src/ui/Spinner.ts、app.ts | stable UI 下 spinner 直接 return，长等待像卡死 | 120ms 低频定时器（`FASTCODE_SPINNER_MS` 可调）；Thinking/Streaming/Waiting for tool 三态 |
| 41 | package/src/agent/ignore.ts、tools.ts | 只硬编码忽略 3 个目录；list_files 全量、grep 全量读；read_file 不截断 | `.fastcodeignore` + 默认忽略；目录摘要 + 符号；read 200KB / grep 1MB 上限；二进制识别 |
| 42 | package/src/ui/Picker.ts、commands/model.ts、provider.ts、providers/index.ts | `/model` 只能打印文本并手输 id；离线/在线无区分 | 交互选择器（↑/↓、1-9、Enter、Esc）；`probeProvider()` 标注离线；旧 `/model <id>` 保留 |
| 43 | package/src/commands/effort.ts、providers/*、types.ts、ui/StatusBar.ts | 请求层完全没有 reasoning/thinking 参数 | `/effort auto|low|medium|high|max`；OpenAI 系 `reasoning_effort`、OpenRouter `reasoning.effort`、Anthropic `thinking.budget_tokens`；状态栏显示 |
| 44 | scripts/smoke-test.mjs | 测试在模块加载后才设置 `FASTCODE_HOME`，`paths` 已缓存真实目录，污染 `~/.fastcode` | 在任何 import 前设置临时 HOME；密钥用例改为 provider 级语义 |
| 45 | docs/*、README.md、README.zh.md、LOCALIZATION_REPORT.md | 文档仍描述旧 Key 作用域、8 轮上限、stable 关闭动画 | 新增 `docs/DEVLOG.md`；更新架构、配置、模块、审计与两份 README |

## 验证方式

- 语法：package/dist 下全部 JS 通过 node --check（无语法错误）。
- 单元测试（直接在 Node 中 import 模块）：
  - SSE：CRLF 帧、CRLF 跨 chunk、LF 帧、末尾无空行，均正确产出事件。
  - Termux：设置 TERMUX_VERSION 或 PREFIX 含 com.termux 时识别为 termux，并自动启用稳定 UI。
  - Agent 工具：write_file / read_file / grep / list_files 正常；越界路径 ../.. 被沙箱拒绝。
  - 协议与技能：fastcode_tool 调用解析、SKILL.md frontmatter 解析正确。
- walk 容错：用真实软链接构造悬空链接、有效链接、越界链接与环形链接，grep/list_files 均 ok=true，
  悬空链接被跳过，越界链接不深入（未进入 C:/Windows），环形链接不死循环（6ms 结束）。
- 模型方言：本地 HTTP 服务先对 max_tokens/temperature 返回 400，再接受 max_completion_tokens，
  客户端自动重试并成功流式返回；首个请求成功时不会重试（仅 1 次请求）。
- 端到端：pnpm 安装依赖后，用 ink-testing-library 无头渲染 App：
  - 欢迎语正常显示；
  - 输入 /help 能看到命令列表（19 条）；
  - 输入 /login anthropic sk-SECRET-123 后，最终画面不含明文 Key，且显示打码。
- CLI：--version 输出 0.1.6；skills list / skills search 正常；doctor 输出诊断；update 输出版本对比。

## 本地复现（需要 Node.js >= 18.17）

    cd package
    npm install
    npm run check          # 冒烟测试 + typecheck + lint + build
    node bin/fastcode.mjs doctor
    node bin/fastcode.mjs update

## 尚未处理 / 已知限制

- 本仓库已逆向重建 TypeScript 源码树（package/src），dist 可随时用
  `cd package && npm run build`（tsc + esbuild）重新生成；改功能请改 src，不要再直接改 dist。
- 0.1.6-beta 起旧 provider-only / v2（`provider::model`）Key 会自动迁移为 provider 级 Key，
  原文件备份为 `auth.json.v2.bak`；同一 provider 多把不同 Key 只保留 `addedAt` 最新的一把。
  （0.1.6 当时按 unbound 处理，不自动迁移。）
- 技能市场 skillshub.wtf 需要付费，属上游问题，未改。
- Termux 真机已验证（LG V409N / Android 12 / Termux 0.118.2）；剩余限制：Ink 5.x IME 光标定位、
  3 个 string-width 版本、approval pending UI 未实现。详见 `docs/DEVLOG.md`。
