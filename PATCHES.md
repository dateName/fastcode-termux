# FastCode 0.1.3 → 0.1.8-beta.0 修复清单

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

## 0.1.8-beta.0（2026-11-09，未发布）

> 基于 0.1.7 tag 之后的工作树修复；已本地 build/打包，尚未发布。包含 shell 会话、并发、退出保护、审批 feedback、压缩/投影、TUI 与版权。

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
- 验证：`typecheck` / `lint` / `build` 通过；Windows `npm test` **282/282**；`verify-artifacts` 通过；`release/` 已生成 0.1.8-beta.0 tar.gz/zip/tgz 与 `SHA256SUMS`。
- 额外手工核对：审批 feedback 源码逻辑、压缩/投影（`/compact` 元数据、摘要顺序、cleared、工具折叠、summary 安全删除）、`session_end` 保存口、Windows one-shot 异步停止、one-shot `active=1/pool=0/maxPool=2/maxSpawnPerTurn=8`、第 9 个 one-shot spawn limit、msys `sh -s` 的 `exit 0`/状态隔离/`set -e`。Termux 真机待复跑。
