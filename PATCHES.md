# FastCode 0.1.3 → 0.1.9-beta.2 修复清单（工作树，未发布）

> 本版 = 0.1.8 + P4–P9 harness + B29–B45；当前工作树 **未提交、未推送、未发布**；npm `latest` 为 0.1.8，`beta` 为 Release workflow 误发的 0.1.9-beta.1（token 401，待回退）。

基线：npm 包 @simplelittledev/fastcode 0.1.3（本项目 package/ 内的已编译产物）。
前 14 项直接作用于 package/dist 的编译 JS；第 15 项起已由 dist 逆向重建 TypeScript 源码树
（package/src 成为唯一事实来源，dist 由 `tsc + esbuild` 重新生成）。

## B29–B45 收口（2026-11-26）

| 编号 | 文件 | 修复 | 状态 |
|---|---|---|---|
| B29 | `agent/limits.ts`、`agent/runner.ts`、`agent/tools/grep.ts`、`app.ts` | buffer 增加 `fullValue()`；runner 从 `result.rawOutput` 落 raw；grep 透传 `rawText`/`droppedChars` | 已完成；真实 provider 未验 |
| B30 | `agent/policy/sensitive.ts`、`session/raw-output.ts`、`app.ts` | raw 记录真实丢弃字符；facts/raw 出口统一 `redactSensitive` | 已完成 |
| B31 | `lib/diff.ts` | DP 预算 250000 → 4,000,000；超预算先剥公共前后缀，再用唯一行锚点 + LIS 继续分 hunk | 已完成；n/p 翻页未做 |
| B32 | `agent/tools/write_file.ts`、`append_file.ts` | 改为读取完整 before，不再用 16K 前缀计算 diff/审批 | 已完成 |
| B33 | `app.ts` | JSON UI 审批 deny 文案改为“无交互审批通道”，不再称协议未接线 | 已完成 |
| B34 | `app.ts`、`agent/compaction.ts` | `approval` fact 增加 `source`；Requests/Notes/Actions/Outcomes 带 `[seq=N]`，Requests 上限 20 | 已完成 |
| B35 | `session/raw-output.ts` | 会话 raw 额度按字符统计，不再用 `stat.size` 字节与字符阈值比较 | 已完成 |
| B36 | `config/paths.ts`、`lib/diagnostics.ts` | `lockdown()` 返回布尔状态；doctor 打印 anchorChars | 已完成 |
| B37 | `ui/DiffPreview.ts` | 按完整 hunk 截断并提示 `/expand <id>`，不再从 hunk 中间硬切 | 部分；native 预览限长仍在 |
| B38 | `session/projection.ts`、`types.ts` | INTERRUPTED 结果保留可读文本，同时写结构化 `code` / `doNotRetry` | 已完成 |
| B39 | `commands/expand.ts`、`app.ts`、`types.ts` | 保存最近 tool_result；`/expand <id>` 重放完整输出与 diff；编辑类工具不折叠 | 部分；`<Static>` 原位重渲染未做 |
| B40 | `commands/threads.ts` | 无参不弹 picker，显示当前值并预填 `/threads `；范围 1–128 | 已完成 |
| B41 | `cli-main.ts` | `sess`/`ls` 作为 `sessions` 别名，不再当 prompt | 已完成 |
| B42 | `cli-main.ts`、`session/provenance.ts` | `sessions show` 打印 tool_call/tool_result/compacted/checkpoint；`--full`、`--max-chars`；追加 provenance 告警 | 已完成 |
| B43 | `cli-main.ts`、`session/log.ts` | JSONL 被 prune 后可从 `.projection.json` 列出、show、resume | 已完成 |
| B44 | `session/log.ts`、`cli-main.ts` | 按事实计数；列表增加 cwd/model；`--all`/`--limit`；projection-only 入列表 | 已完成 |
| B45 | `headless.ts` | headless 默认写 session log；`FASTCODE_HEADLESS_SESSION_LOG=0` 关闭 | 已完成 |
| R1 | `cli-main.ts` | `fastcode resume` 无 id 时打开终端选择器：↑/↓、1–9、Enter、Esc；`resume <id>`/`latest` 保持直连；非 TTY 回退最近一条 | 已完成 |
| R2 | `commands/cost.ts`、`cli-main.ts`、README/CONFIGURATION | `/cost` 兼容空会话 totals；CLI `--help` 补 config export/import、sessions 参数、resume picker、skills `--force`；命令表补齐别名和子命令 | 已完成 |
| R3 | `i18n/catalog/{en,zh}.ts`、`ui/*`、`app.ts` | 中文覆盖 banner、prompt、trust gate、picker 提示/页码、status bar、activity、help/about、footer；新增 zh catalog 全 key 回归 | 已完成 |
| R4 | `agent/runner.ts`、`app.ts`、`session/projection.ts`、`providers/catalog.ts`、`agent/tools/readers.ts` | 清理英文界面残留中文：中断/取消提示、`[user interrupted]`、projection 说明、provider 标签、列表分隔符；新增英文无 CJK 回归 | 已完成 |
| R5 | `scripts/security-test.mjs`、`docs/SECURITY_MATRIX.md`、`.github/workflows/verify.yml` | 新增 24 项安全攻击回归矩阵与设计/缺口规划；`npm run security`；CI 在 check 后执行 | 已完成 |

验证：计数见 `fastcode/docs/VERIFICATION_BASELINE.md`；POSIX/Termux 未实跑。

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
- 不再内置技能市场 URL：默认 `skillsRegistry` 为空；用 `/skills registry <url>` 或
  `FASTCODE_SKILLS_REGISTRY` 显式配置后才支持按名称/owner-repo 安装，直接 URL 安装不受影响。
- Termux 真机已验证（LG V409N / Android 12 / Termux 0.118.2）；剩余限制：Ink 5.x IME 光标定位、
  3 个 string-width 版本、approval pending UI 未实现。详见 `docs/DEVLOG.md`。

## 0.1.7 追加（2026-10-30，已随 0.1.7 发布）

- Guardrails 三态/Hard Block 优先级、AST 第二意见、printenv 与 .env 分级。
- 审批 resolver（tty/native/plain/json）、once/session/always、catalogHash、trust --forget。
- `/provider`、`/model`、`/login` 无参数统一模型配置 TUI；取消不提交、key 掩码。
- 会话 projection manifest、剪枝后恢复、tool_call/result 配对修复。
- 配置 stat 指纹缓存、技能目录 sha256、构建产物防 tsc 覆盖。
- 验证：开发期基线 PC smoke 207/207；Termux 真机 smoke 212/212（0.1.6-beta 同源构建）。收口后数据见下方 275/281。

## 守卫敏感文件重建（阶段 1，2026-11-06，已随 0.1.7 发布）

- 依据 `fastcode-bug-report.md` / `fastcode-guards-report.md` 在当前仓库重建 7 类守卫，不移植 Termux 本地补丁。
- 修复 `>>` / `>|` / fd 追加重定向目标解析；`.env` 家族、敏感文件名、敏感目录、共享存储重定向纳入 Hard Block。
- 新增 `credential_read`（`critical-credential-read`）与 `sensitive_file_egress`（含 `sensitive-file-upload`）；非重定向写入（tee/sed -i/cp/install）与 mv 敏感文件 Hard Block。
- `package/dist/agent/guards.js` 与 `package/dist/cli.js` 由 `npm run build` 同源重建；新增 `node package/scripts/verify-artifacts.mjs` 检查运行时字符串标记。
- 验证：Windows `npm test` 212/212；`npm run typecheck` / `lint` / `build` / `verify-artifacts` 通过。Termux 真机未复验。
- 未完成：PR CI workflow（typecheck/lint/smoke/build/产物一致性）尚未新增；`release.yml` 仍只在 `v*` tag / 手动触发。

## 精准读写与结构化工具契约（阶段 2，2026-11-06，已随 0.1.7 发布）

- `read_file` 增加 `offset/limit`（1-based）与 `totalLines/returnedLines/truncated`；超出 EOF 返回 `NOT_FOUND`。
- `read_many` 增加总字节预算（`FASTCODE_READ_MANY_MAX_BYTES`）与 `filesRead/filesSkipped/returnedBytes`。
- `grep` 增加 `caseSensitive/glob/context/maxResults`，prepare 期编译正则并限制 pattern 长度；非法正则返回 `INVALID_ARGS`。
- `ToolResult` 增加 `code/hint/truncated/行字节统计/matches`；registry 统一映射 `ENOENT/EEXIST/EISDIR/SANDBOX_DENY/APPROVAL_DENY`。
- `replace_in_file` 增加 `expectedMatches` 与计数回执；`copy_file` 默认拒绝已存在目标（`overwrite:true` 显式覆盖）；`delete_file` 目录需 `recursive:true`；`move_path` 增加 EXDEV copy+remove 回退；write/append/make_dir 区分 created/touched。
- headless NDJSON 增加 `v/seq/ts`、`tool_call`、`tool_result` 的 output/side_effects/code/truncated、usage、error.code；TUI session JSONL 同步追加可选字段。
- 验证：Windows `npm test` 235/235；`npm run typecheck` / `lint` / `build` / `verify-artifacts` 通过。Termux 真机未复验。

## Egress 策略与审批隔离（阶段 3，2026-11-06，已随 0.1.7 发布）

- 新增 `package/src/agent/policy/egress.ts` 纯策略模块；`registry.execute()` 在 prepare 后、approve 前判定。
- 默认 `enabled:false + mode:"audit"`：只记录 `egress_denied`，不改变工具结果；`mode:"off"` 为 kill switch；`enabled:true + mode:"block"` 才拦截。
- block 态返回 `code:"EGRESS_DENY"`；不生成审批请求、不写 `trusted.json`；`ALLOW_DANGEROUS`/`TRUST_ALL`/`sharedDirs` 不能覆盖。
- 覆盖：工具路径读写/删/复制/移动/patch、payload、shell command 内容标记、工具输出回模型前的标记扫描、NDJSON/TUI/session 事件。
- 内置敏感 basename/路径、共享存储、内容标记不可删除；`denyPaths`/`denyGlobs` 只追加；`maxScanBytes` 超预算 block 态 fail-closed。
- 配置指纹缓存即时生效；`doctor` 增加 egress 段；projection 将 `egress_denied` 保留为 system 消息。
- 未覆盖：provider 网络请求正文、session JSONL 落盘正文、CLI 子命令输出、skills/plugins prompt 注入、TTS/share/clipboard（本轮无工具）、debug 日志。
- 验证：Windows `npm test` 255/255；`npm run typecheck` / `lint` / `build` / `verify-artifacts` 通过。Termux 真机未复验。

## 事件/会话兼容与运维验收（阶段 4，2026-11-06，已随 0.1.7 发布）

- 新增 `package/src/lib/lifecycle.ts`：SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底并调用 `shutdownShells()`；headless 同时响应 SIGTERM/SIGHUP 中止。
- 流式重试通过 `notice` 事件可见；`doctor --net` 输出 registry 连通性结论；`/jobs` 增加会话年龄与 10 分钟回收提示。
- projection 保留 `notice` 与 `egress_denied` system 消息；新增真实 session JSONL 往返、旧 JSONL 无新字段 resume、旧 4 字段 projection fingerprint 测试。
- 新增 `package/scripts/bench.mjs`（直接 `node` 调用；`package.json` 未注册 `bench` 脚本）；记录 Windows 基线。
- 回滚演练：`git archive HEAD` 到临时目录后旧 `bin/fastcode.mjs --version` 正常启动。
- 验证：Windows `npm test` 263/263；`npm run typecheck` / `lint` / `build` / `verify-artifacts` 通过。Termux 真机未复验；TUI egress 渲染路径仅代码检查，未在 smoke 中启动 Ink。

## DeepSeek 默认模型调整（2026-11-06）

- `package/src/providers/deepseek.ts`：`defaultModel` 从 `deepseek-v4-pro` 改为 `deepseek-flash`。
- 内置模型列表保持 `deepseek-v4-pro` / `deepseek-flash` 两项；显式 `/model deepseek-v4-pro` 仍可用。
- 示例文档中的 DeepSeek 当前模型同步为 `deepseek-flash`；历史 CHANGELOG/DEVLOG 不改写。
- 验证：新增 “DeepSeek defaults to deepseek-flash” 回归；Windows `npm test` 263/263；typecheck/lint/build/verify-artifacts 通过。

## Provider 请求协议参数化（2026-11-06）

- 新增 `package/src/providers/spec.ts`：`resolveBaseUrl` / `buildRequestUrl` / `buildHeaders` 三个纯函数；占位符缺失时抛错，不发出请求。
- `package/src/providers/openaiCompatible.ts` 的 `StreamOptions` 增加 `chatPath/modelsPath/query/pathParams/authHeaderName/authPrefix`；`toRequestSpec` 保留 baseUrl trim 与 legacy `authHeader` 前缀语义。
- 现有 13 个 provider 不传新字段，默认 URL/header 快照不变；`modelsPath:null` 直接返回静态模型。
- 刻意保留 models 请求旧行为（不附加 `extraHeaders`），以满足现有 provider 快照一致；chat 请求仍按旧顺序应用 extraHeaders 后 auth。
- 验证：新增 10 项协议回归；Windows `npm test` 273/273；typecheck/lint/build/verify-artifacts 通过。Termux 真机未复验。

## G1 修复：headless notice 映射（2026-11-06）

- 真机测试报告 G1：`runner.ts` 会 yield 重试 `notice`，但 `headless.ts` 的 json/plain 分支未映射。
- 修复：JSON 分支输出 `{"event":"notice","text":...}`；plain 分支把 `[fastcode] ...` 写到 stderr，保持 stdout 只输出回答。
- 新增 2 项回归：假 provider 首次断流后重试，`--ui json` 出现 notice 事件；`--ui plain` stderr 出现重试提示且 stdout 保留回答。
- 验证：Windows `npm test` **275/275**；Termux 真机（同步修复后）**281/281**，exit 0；typecheck/lint/build/verify-artifacts 通过。
- 手机备份：`~/opt/fc-backup-20261106-232535-g1`（修复前）；证据 `/sdcard/Download/fc_smoke_phone_g1.txt`。

## 0.1.7 定版与发布（2026-11-07）

- `package/package.json`、`package/package-lock.json`：`0.1.7-beta` → `0.1.7`。
- `README.md` / `README.zh.md` / `package/README.md` / `docs/*` / `脑图.md` / `RUNBOOK.md` / `AGENTS.md` 同步当前版本；历史 0.1.6-beta 记录保留。
- 发布：本地 tag `v0.1.7` 指向 `be6e604`；当时 `release/` 为 0.1.7 便携包 tar.gz/zip、npm tgz 与 `SHA256SUMS`（现已被 0.1.8-beta.0 本地打包替换，可从 tag/历史取回）。
- 验证：Windows `npm test` 275/275（2026-11-09 复跑，HEAD `be6e604`）；Termux 真机 281/281（2026-11-06）；typecheck/lint/build 通过；verify-artifacts 脚本通过。
- npm：2026-11-09 查询 registry 仍为 `latest=0.1.6` / `beta=0.1.6-beta`；npm 侧同步待再次核对。
- 未完成：PR CI 门禁、`/egress` 命令、ProxyAgent 代理、Tier 3、写路径 TOCTOU 复核、ReDoS 隔离；`bench` / `verify:artifacts` 脚本未注册到 `package.json`。

## 0.1.8-beta.0（2026-11-09，npm beta 已发布）

> 基于 0.1.7 tag 之后的工作树修复；已本地 build/打包，并发布到 npm 的 `beta` tag。包含 shell 会话、并发、退出保护、审批 feedback、压缩/投影、TUI 与版权。

### 常驻 shell 会话修复（0.1.7 tag 之后）

依据 `config/fast_其他.txt` 的六项问题修复 `src/agent/shell-session.ts`：

- ① `close` 退出码 0 记为 `done`，不再无条件 `failed`。
- ② 每条命令包进子 shell，隔离 `export`/函数/`umask`/`set -e`/`exit`。
- ③ `exit`/`set -e` 不再杀死常驻 shell，避免 spawn 预算级联耗尽。
- ④ 含后台操作符的命令完成后回收 resident，残留输出丢弃，不再串到下一条命令。
- ⑤ 两个 resident 都忙时排队等待空闲 shell，不再立即 `busy` 失败。
- ⑥ `needsOneShot` 改用 `bash-parser` AST；`echo top` 不再误判为交互式 one-shot。
- ⑦ resident 池默认 **2**（安全默认），`/threads <1-6>` 可调大、上限 6；resident 满载后新命令排队。one-shot 路径由 `FASTCODE_MAX_SPAWN_PER_TURN`（默认 8/轮）单独限制，满额立即失败；两套预算不共享。
- ⑧ `/exit`（`/quit`、`/q`）在运行中需要二次确认：第一次提示停止并保留部分输出，5s 内第二次才 abort → `shutdownShellsAsync` → 关闭 session → 退出；`Esc` 取消并保留部分输出，`Ctrl+C` 在 run 中第一次取消、第二次退出。
- ⑨ 退出保存口：`session.close({reason})` 写 `session_end` + projection，并对 JSONL/projection best-effort fsync。
- ⑩ 安全停止：`shutdownShellsAsync` 采用 SIGTERM → 等待 close → 强制 SIGKILL，避免退出后残留子进程。
- ⑪ 压缩承接位：`session_end.compaction` 预留 `source` / `summaryRef` / `pending`，当前默认 `none/null/false`；JSONL 全量事实保留。
- ⑫ TUI compact 状态栏 `effort` 重复渲染修复（`src/ui/StatusBar.ts`），只显示一次。
- ⑬ 新增 `/threads`（别名 `/pool`）与 `config.shellPoolSize`；TUI/headless 启动时应用，命令数 30 → 31。
- ⑭ 审批 “Deny with feedback” 输入修复：TUI/plain 选择后进入文本等待（Enter 提交、Esc 取消、空输入不提交）；JSON gate feedback 要求 `input`；native 用 `termux-dialog text`，不可用回落 TUI；无输入 `decisionForOption` fail-closed，不再把提示语当反馈。
- 纠偏（依据 `config/sj.txt`）：`shellPoolSize`/`/threads` 只限制 **resident** 池，不是全局并发上限；one-shot 走独立 `FASTCODE_MAX_SPAWN_PER_TURN`（默认 8/轮）预算，满额立即失败不排队；`active` 统计 resident + one-shot，`pool/maxPool` 只算 resident；跨 turn 未结束的 one-shot 仍占并发。旧“常驻 export 会泄漏到后续命令”的观察在子 shell 修复后已不成立。
- ⑮ `/compact` 写 `compacted` fact（含 summaryRef/token/dropped/keep），修复手动压缩后 resume 复活全量历史。
- ⑯ `/clear` 写 `cleared` fact；投影只重建最后一次 cleared 之后的事实。
- ⑰ 摘要顺序 Notes → Outcomes → Files → Requests → Actions；limit marker；伪文件名过滤；新压缩清理本会话旧 summary。
- ⑱ 投影工具载荷折叠为编辑事实；单条 8000 字符保留头尾；总上限约 200KB；dropped marker；保护 summary/compaction marker；sessionMeta 取首个 session_start。
- ⑲ `/context` 使用实际 env 配置；新增 `FASTCODE_COMPACTION_RATIO` / `KEEP_TURNS` / `SUMMARY_TOKENS`。
- ⑳ 版权合规：根 `LICENSE` + `package/LICENSE` 保留原始 `Copyright (c) 2026 SimpleLittleDev` 与 MIT 全文，补 FastCode-Termux 自有版权行、上游来源与修改说明；README/package README 增加 License 段。
- ㉑ 文档补全：README / README.zh / package README 增加完整 CLI 子命令、TUI 斜杠命令与设置入口；`docs/CONFIGURATION.md` §8 为速查（含 `/threads`、`/steer`、trust/skills/sessions/doctor/update）。
- 验证：`typecheck` / `lint` / `build` 通过；Windows `npm test` **282/282**；`verify-artifacts` 通过；`release/` 已生成 0.1.8-beta.0 tar.gz/zip/tgz 与 `SHA256SUMS`；npm `beta=0.1.8-beta.0`。
- 额外手工核对：审批 feedback 源码逻辑、压缩/投影（`/compact` 元数据、摘要顺序、cleared、工具折叠、summary 安全删除）、`session_end` 保存口、Windows one-shot 异步停止、one-shot `active=1/pool=0/maxPool=2/maxSpawnPerTurn=8`、第 9 个 one-shot spawn limit、msys `sh -s` 的 `exit 0`/状态隔离/`set -e`。Termux 真机待复跑。

## 审计修复（2026-11-15，已随当前版本发布）

> 依据 `yq.txt` 的 A–D 缺陷线与 F/J/G/C/A/K/B/D/E/H 审计项；详见 `docs/DEVLOG.md` 同名小节与方案 §4 #94–#103。

### A 线：限界与压缩

- `src/agent/tools/readers.ts`：`readFileRange` 先按 `budget = maxBytes - returnedBytes - 1` 裁剪单行（UTF-8 安全）再入结果；`grep` 命中行裁剪 500 字符。
- `src/agent/limits.ts`：新增 `DEFAULT_TOOL_MESSAGE_LIMIT` / `toolMessageLimit()` / `boundToolMessage()`。
- `src/agent/runner.ts`：native/legacy 两条路径在写 `role:"tool"` 前统一 `boundToolMessage`。
- `src/agent/compaction.ts`：摘要采样 256KB；`collectFiles` 采样 64KB + 正则 `{1,240}`；`clip` 限长；无进展熔断（0.9 比例、20KB→8KB）。
- `src/agent/shell-session.ts`：job 输出窗口 1MB → 256KB。
- `src/agent/tools/readers.ts`（grep）：超长命中行裁剪。

### B 线：协议

- `src/agent/protocol.ts`：只消费含 `<invoke>` 的块；已知外来方言 0 调用 → `errors`；`stripToolCalls` 保留外来块。
- `src/lib/native-tools.ts`：`resolveIndex` 无 index 归并；对象 arguments 归一。
- `src/providers/openaiCompatible.ts`：非流式 JSON 兜底；SSE 传入 `req.idleTimeoutMs`。
- `src/agent/protocol-mode.ts`：`isNativeUnsupportedError` 结构判定。

### C 线：错误生命周期

- `src/agent/runner.ts`：请求前 `pairToolMessages`；提前 break 补 tool 占位；`lastVisible` 重置。
- `src/app.ts`：配额提示收窄。
- `src/lib/net.ts`：`isQuotaError` 收窄；`retryStream` 抛 `QuotaError`。
- `src/headless.ts`：error → stderr/JSON + 非零退出码；补协议降级回调。
- `src/index.ts`：初始化错误去 minified 堆栈（`FASTCODE_DEBUG` 保留）。

### 配置 / 权限 / provider 边界

- `src/config/paths.ts`：POSIX 数据目录 0700；`src/config/store.ts`：config 0600、损坏 `.bak` + 提示；`src/session/log.ts`：JSONL 0600。
- `src/lib/http.ts` / `src/agent/stream.ts` / `src/providers/anthropic.ts`：共享 `requestIdleTimeoutMs`；`src/lib/diagnostics.ts` 上报请求空闲、SSE 回退、tool 消息上限。
- `src/providers/custom.ts`：`FASTCODE_AUTH_HEADER` / `FASTCODE_AUTH_PREFIX` / `FASTCODE_EXTRA_HEADERS`。
- `src/providers/index.ts` + `src/providers/catalog.ts` + `src/types.ts`：`modelsPath` 暴露给 probe；占位符解析后再探测。
- `src/cli-main.ts`：`sessions show` 不存在 id、`trust --forget` 空值/不存在、非法 model ID 返回非零。
- `package/package.json`：注册 `verify:artifacts` / `bench`。

### 验证

- `npm run typecheck` / `lint` / `build` 通过；Windows `npm test` **325/325**；`npm run verify:artifacts` 通过。
- 新增回归：超大单行读取、外来方言显式失败、无 index 归并、对象 arguments、压缩大消息、probe modelsPath、custom 认证头、grep 长行。
- 未做：Termux 真机复跑、方言解析器扩展、厂商端点联机验证、PR CI、`/egress` 命令、ProxyAgent。

## 执行后端抽象（2026-11-15，基础层，CLI 后端默认不注册）

- `src/agent/stream-events.ts`（新增）：`StreamEvent` 闭集（text/thinking/tool-call/usage/turn-end）+ `StreamAssembler` 单一折叠 + `chunkToStreamEvents` 适配旧 chunk；`usage` 先于 `turn-end`、结束后忽略、中断不保留未完成工具调用。
- `src/agent/stream.ts`：`runStream` 只保留 idle/retry/abort；`RunStreamResult.reasoning`。
- `src/types.ts`：`ChatChunk.reasoning?`；`Provider.transport/capabilities/authKind`。
- `src/agent/runner.ts` / `src/app.ts`：`assistant_raw.reasoning` 与会话事实保留 thinking。
- `src/lib/child-env.ts`（新增）：子进程环境 allowlist + 凭据/ANSI 脱敏。
- `src/lib/process-tree.ts`（新增）：进程树终止下移；`src/agent/process-tree.ts` 兼容 re-export。
- `src/lib/values.ts`（新增）：`assertNever`。
- `src/providers/stdioBackend.ts`（新增）：规范 NDJSON CLI 后端；只提议工具、不执行；allowlist 环境；abort 收敛；默认不注册。
- 文档：`docs/EXECUTION_BACKENDS.md`（新增）；ARCHITECTURE/MODULES/CHANGELOG/DEVLOG 同步。
- 错误语义补强：持续协议失败 → `stopReason:"protocol_error"` + error 事件 + headless 非零；`incomplete` headless 非零；`capabilities.retryable:false` 禁止重放；`auth.json` 损坏保留 `.corrupt.bak` 并提示一次。
- 验证：`typecheck` / `lint` / `build` / `verify:artifacts` 通过；Windows smoke **325/325**；新增事件装配/thinking/环境白名单/脱敏/NDJSON/只提议/abort/错误语义回归。
- 未做：接入配置/命令/UI、会话续接、外部模型目录、只读 CLI 端到端、Termux 真机。

## 失败语义与方言扩展（2026-11-15）

- `src/session/log.ts`：append 写失败 → stderr + `degraded` + 返回 0；`close()` 幂等，degraded/日志关闭时跳过 projection/fsync/prune。
- `src/app.ts`：审批决策写 `approval` fact（decision/scope/requestId/approvalKey 哈希）；`trusted.json` 仍是授权状态。
- `src/agent/approval-json.ts` + `src/headless.ts`：新增 `gate:decision` 帧；headless 无 session log 时只发帧、不落盘。
- `src/providers/index.ts` + `src/app.ts`：`probeProviderDetailed()` 返回 `{ok, reason, status}`；picker 显示具体原因（无 /models / HTTP / 超时）。
- `src/agent/runner.ts` + `src/providers/stdioBackend.ts`：`incomplete` error 事件；stdio 收到 `done` 后 terminal latch。
- `src/agent/protocol.ts`：新增 Hermes/Qwen、Mistral（pre-v11/v11+）、Kimi K2、Llama（tag/裸 JSON）；`detectedDialects`；检测到标记但 0 调用 → `protocol_error`。
- 文档：新增 `docs/ERROR_SEMANTICS.md`；ARCHITECTURE/MODULES/CHANGELOG/DEVLOG 同步。
- 验证：`typecheck` / `lint` / `build` / `verify:artifacts` 通过；Windows smoke **325/325**；新增 degraded 会话、幂等 close、审批决策帧、probe 归因、incomplete、terminal latch、五种方言回归。

## 结构治理 L0–L2（2026-11-15）

- `docs/MODULES.md`：目录契约（新增文件登记、依赖方向、受控上行、同名命名空间）；补 `lib/debug.ts`、`commands/threads.ts`、`ui/picker-window.ts`。
- `docs/AUDIT.md`：标题标注为 0.1.6-beta 起（当前 0.1.8-beta.0），历史正文保留。
- `LOCALIZATION_REPORT.md`：增加“文件名沿用历史，实际为交接报告”说明。
- `CONTRIBUTING.md`（新增）：内联 AGENTS 关键约束（clone 后可见）。
- `docs/CONFIGURATION.md`：移除 `contextBudgetChars` 行，标注内部 env `FASTCODE_SANDBOX`/`ROOT`。
- 死代码：删除 `src/agent/context.ts`、`contextBudgetChars`（store/runner）及对应 dist 文件。
- 基线（当时）：未执行 pull/sync；本地 HEAD `70eaea9`，`4d2e1c3b` 本地不存在，工作树未提交改动较多。
- 验证：`typecheck` / `lint` / `build` / `smoke` / `verify:artifacts` 通过。

## 当前版本追加（2026-11-17，已发布）

- `src/agent/runner.ts`：native 降级时只替换尾部 native agent 段为 legacy 文本协议段，保留调用方 system 前缀，降级请求重新包含 `<fastcode_tool>` 语法（#152）。
- `src/agent/protocol.ts`：`stripUnfencedText` 每步 boundary 按当前正在 replace 的字符串计算 offset，混排 `ANCHOR→D4→D5` 不再残留可见标记（#151）。
- `src/providers/openaiCompatible.ts`：400 message 去掉重复的 `400 Bad Request:` 前缀（#150）。
- 验证：`typecheck` / `lint` / `build` 通过；Windows smoke **355/355**；`verify:artifacts` 通过；npm `beta` 与 GitHub Release 已发布。

## 安全修复（2026-11-21，工作树，未发布）

- **G-A1 / B2-01**：新增 `src/lib/realpath.ts` 逐组件解析符号链接（含悬空链接）；`tools/paths.ts` 增加 `sandboxWritePath`/`assertNotSymlink`/`atomicWriteFile`；`write_file`/`append_file`/`copy_file` 使用 `O_NOFOLLOW`；`policy/egress.ts` 的路径目标走 `realpathOf`。
- **G-A1 / B2-01b**：write/copy(overwrite)/replace 改为同目录 tmp+rename（断开硬链接）；append 在 open 后检查 `nlink>1` 并拒绝；Windows `fs.linkSync` 4 项 + 普通追加回归通过。
- **G-A2 / B2-02**：`session/log.ts` 新增 `resolveResumeFile`（仅 sessions 下 id/`.jsonl`）；`projectionPath` 改为大小写不敏感；`session/projection.ts` 的 `writeProjection` 拒绝 `target === source`；`cli-main.ts` 的 `resume` 改用新校验。
- 回归：`scripts/smoke-test.mjs` 新增 B2-01/B2-01b/B2-02 用例；Windows **ALL PASS (369/369)**（最终文件 symlink 用例因本机 `EPERM` 跳过，悬空目录 junction 祖先与硬链接用例通过）；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。Termux/POSIX 待复验。

## 协议/参数修复（2026-11-21，工作树，未发布）

- **1.3 参数修复**：新增 `lib/values.ts` 的 `parseJsonObjectWithRepair`；尾逗号、未闭合字符串/括号、单元素数组、已知数值/布尔字符串一次修复；未知字段仍由工具校验失败。
- **B10**：native `arguments` 解析失败不再构造无参调用；回注 `tool_result{code:"INVALID_ARGS"}`，工具执行 0 次。
- **B9/B14**：`consecutiveProtocolErrors` 在合法轮清零；连续 2 次 native 参数失败停止；`max_turns` 仅在最后一轮失败时改判 `protocol_error`。
- **B11/B12**：`error` 事件新增 `detail`（最后一次具体错误）；`protocol_error` 的 `finalText` 不再重复错误文案；headless JSON 同步 `detail`。
- **B13**：`protocol.ts` 新增 `hasUnexecutedToolMarkup`（围栏外）；0 调用但正文含标记时在可见文本追加“未执行”提示；围栏示例不提示。
- 回归：Windows **ALL PASS (381/381)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

## CI 门禁 B7（2026-11-21，工作树，未发布）

- 新增 `.github/workflows/verify.yml`：push/PR、Node 24、`npm ci`、`npm run check`、`verify:artifacts`、`verify-gate`、`git diff --exit-code -- package/dist`。
- 新增 `scripts/verify-gate.mjs`：workflow 关键项、`dist` 运行时字面量、`--self-test` 反证；`package.json` 注册 `verify:gate`。
- 验证：`npm run check`（381/381）、`node scripts/verify-gate.mjs --self-test`、构建哈希稳定。

## 统一事件流（2026-11-21，工作树，未发布）

- 新增 `src/agent/event-stream.ts`：`EventStream` 信封（`v:1/seq/ts/session_id/turn`）与 `serializeAgentEvent`；headless JSON 只消费该序列化器。
- `assistant_raw.reasoning` 单独成 `reasoning` 帧；`gate:ask`/`gate:decision`/`gate:error` 统一 `v:1`，入站兼容旧 `version`。
- 回归：Windows **ALL PASS (385/385)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

## 能力目录与结构化 diff（2026-11-21，工作树，未发布）

- **2.2 能力目录**：`lib/model-meta.ts` 增加 `pricing`、`modelMetaSource`、`MODEL_META_UPDATED`、`estimateCostUsd`；内置已知模型 pricing；用户 `model-meta.json` 可覆盖；`openaiCompatible` 的 usage 计算 `costUsd`；doctor 显示 price/source/updated。
- **2.4 结构化 diff**：`write_file`/`replace_in_file` 返回 `oldText/newText/changedStartLine/oldLineCount/newLineCount/diffTruncated`；headless JSON 输出 `old_text/new_text/...`；TUI 显示 diff 摘要。
- 回归：Windows **ALL PASS (390/390)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

## 回滚 / 指令 / 权限 / 诊断回路（2026-11-21，工作树，未发布）

- **1.1**：`session/projection.ts` 增加 `factsAfterRevert`/`revertBoundary`；`commands/revert.ts` + `/revert <n>`；`--files` 暂未实现。
- **1.2**：新增 `session/instructions.ts`；app/headless 在 agent block 前注入指令；`/context` 显示来源。
- **2.1**：新增 `agent/policy/permissions.ts`；guards Soft Gate 接入分层 allow/deny；未信任项目层忽略；Hard Block 不变。
- **2.3**：新增 `agent/check-loop.ts` 与 `checkCommand/checkTimeoutMs`；registry 在写类工具后运行检查，失败/超时只报告。
- 回归：Windows **ALL PASS (404/404)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

## 外置扩展 / plan-todo / worktree（2026-11-21，工作树，未发布）

- **2.7**：`plugins/manager.ts` 支持 `plugin.json` manifest、capabilities/scope/version；导入默认关闭；prompt/skills 之外拒绝。
- **2.6**：`session/plan.ts` + `/plan`/`/todo`/`/goal`；`plan` fact；投影 `[plan]` 保护；自动续跑未实现。
- **3.3**：`session/worktree.ts` + `/worktree`；create/list/diff/apply/remove；dirty remove 需 force。
- 回归：Windows **ALL PASS (483/483)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

## B2 修复批次（2026-11-22，工作树，未发布）

- **B2-04**：OpenAI 兼容流要求 `[DONE]`/`finish_reason`，Anthropic 要求 `message_stop`；缺失抛 `IncompleteStreamError`。
- **B2-05**：grep glob 长度 ≤256、`**` ≤8；`.fastcodeignore` ≤256KB / ≤2000 条 / 单条同上。
- **B2-06**：`read_many.maxBytes` 钳制到 `FASTCODE_READ_MANY_MAX_BYTES`；单文件错误标 skipped 并继续。
- **B2-09/10/12/13**：i18n 类型安全；summaryRef 限 sessions 内且 ≤256KB；auth tmp/备份 0600；HTTP/provider 错误正文脱敏。
- **B2-11**：进程组组长退出但组仍存活时继续 SIGKILL 升级（POSIX 回归）。
- **B2-08/B2-14**：短历史动态压缩、headless/prune 清理 summary、投影 arguments 截断与 200KB 硬上限；usage 告警去重、`isCallBoundary` 256 字符后缀、fallback 保留 caller 后缀、400 不再误重试。
- **yq 维护**：`apply_patch` 返回逐文件 `diffs`；post-write 收窄到 write/append/replace/apply_patch/copy；绝对路径 glob 边界修复并合并到 `lib/glob.ts`；FUSE 回读校验/还原失败保留 backup/doctor 显示残留；worktree apply 前要求目标 clean；revert/plan 重建收进 `session/actions.ts`。
- **Atomic seam**：新增 `lib/atomic-file.ts`；write/replace 走 `atomicFile.write`，copy/patch 走 `atomicFile.temp` 句柄；patch 全 async；fallback 成功标记 `atomic:false`；测试覆盖 fallback 成功、restore 成功、restore 失败保留 backup。
- **B2-03**：shell soft-gate 在 Hard Block 后、审批前检查 trust；未信任目录批准一次也不能执行。**B2-07 精确化**：敏感文件本地读取允许，外传由 egress/Hard Block 处理；`sh -c`/`bash -c` 引号路径已覆盖。
- **D1/P2（工作树）**：`ApprovalRequest.patchDiffs` + `plan.files[].diff`；执行 `diffs[].unified` 来自 `applied.files[].diff`；TUI 默认真 diff、gate diffstat 真计数、native/plain 同步。
- **P2**：permission regex 锚定、`*` 不跨目录、连续星号拒绝、项目层 catch-all allow 收窄；atomic restore 安全写、backup `COPYFILE_EXCL`、精确 backup 匹配、Q14 保留 backup、`O_NOFOLLOW` fail closed、native 合法调用清零错误。
- **yq 第二轮**：permissions/grep regex 长度与嵌套量词防护；`**` 上限 4；read_many UTF-8 码点/预算一致；grep 行上限按字节；apply_patch SANDBOX_DENY；worktree recorded base + binary + `--commit` 增量 apply。
- 回归：Windows **ALL PASS (483/483)**（POSIX 484）；`typecheck`/`lint`/`build`/`verify:artifacts`/`verify:gate`/`version-anchors` 通过。
