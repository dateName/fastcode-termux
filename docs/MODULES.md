# 模块职责表

一行一个模块。依赖列只列项目内相对依赖（不含 node 内置与第三方包）。
源码在 `package/src/`，`package/dist/` 是构建产物，不要直接改。

## 目录契约（L0）

- **新增/删除 `package/src/**/*.ts` 必须同步本表**；未登记的文件视为结构缺口。
- 每行写清**依赖方向**（`A → B` 表示 A 依赖 B）；新增跨层依赖必须在“职责”里说明理由。
- 允许的层：入口（`index/cli-main/app/headless`）→ 编排（`agent`）→ 领域（`providers/session/patch/skills/plugins`）→ 基础（`config/lib/types`）。
- 已知受控上行：`config/store → agent/policy/defaults`（defaults 零依赖，避免 config 加载 guards）；`lib/diagnostics → 各层`（诊断聚合，属于应用级探针）。
- 目录搬迁不在 L0–L2 范围；见 `docs/ERROR_SEMANTICS.md` 与项目根 `AGENTS.md` 的交付约束。

## bin 与入口

| 文件 | 职责 | 依赖 |
|---|---|---|
| bin/fastcode.mjs | 优先 import 自包含 `dist/cli.js`，回退 `dist/index.js` / `src/index.ts`；缺依赖时打印修复指引 | dist/cli.js, dist/index.js, src/index.ts |
| src/index.ts | 调用 CLI，非 TUI 子命令直接返回；否则检查 TTY 后加载 Ink/React/App | cli, ink, react, app |
| src/cli-main.ts | 参数解析；provider/model/config/sessions/resume/trust/skills/doctor/update（改名避免 tsc 产物覆盖 dist/cli.js bundle） | skills, store, paths, providers, diagnostics, session/log, session/projection |

## 界面层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/app.ts | TUI 主组件：消费 runner 事件、transcript、输入/选择器、斜杠命令分发；统一 provider → model → key 配置流程并暂存至确认；审批 feedback 文本等待与 Esc 取消 | runner, session, commands, providers, config/store, ui |
| src/ui/Banner.ts | 启动横幅（稳定 UI 下不动画） | 无 |
| src/ui/Message.ts | 消息气泡；Markdown 渲染缓存（不 memo，避免终端 resize 后宽度不更新） | lib/markdown |
| src/ui/Prompt.ts | 输入框与斜杠自动补全；`showCursor` 常开 | ink-text-input, commands/index |
| src/ui/Spinner.ts | 思考动画（stable 模式低频） | 无 |
| src/ui/Picker.ts | 模型/服务商/effort 选择器 | ui/picker-window |
| src/ui/picker-window.ts | Picker 9 行窗口分页与当前页编号计算 | 无 |
| src/ui/StatusBar.ts | 服务商/模型/用量/effort/平台；compact 布局 effort 只渲染一次 | lib/platform |
| src/ui/TrustGate.ts | 首次信任确认 | ink |

## 编排层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/agent/runner.ts | 纯 async generator：压缩、预算、协议选择、工具执行、loop detection、checkpoint、abort；请求前 `pairToolMessages`，写入 tool 消息前按 `toolMessageLimit` 兜底，提前 break 时为未执行调用补 tool 占位；native 参数修复失败不执行工具，连续协议错误在合法轮清零，`protocol_error` 带 `detail` | stream, registry, guards, compaction, model-meta, net, tools, session/projection, lib/values |
| src/agent/registry.ts | 工具注册表；startup 契约断言；prepare → egress → approve → execute → post-write check（仅 write/append/replace/apply_patch/copy）；shell Hard Block 后、soft-gate 前检查 trust；toolCatalogHash | config/trust, guards, tools/index, policy/egress, check-loop |
| src/agent/policy/egress.ts | 纯 egress 策略：敏感路径/内容标记/预算；audit/block/off；denyPaths/denyGlobs；registry 出口判定；路径目标经 `realpathOf` 解析 | guards, tools/types, lib/realpath |
| src/agent/policy/defaults.ts | egress 默认值/类型；供 config/store 使用，避免加载 guards | 无 |

## 领域层：agent / 工具

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/agent/tools.ts | 兼容门面：re-export registry/runAgentTool/类型 | registry |
| src/agent/tools/index.ts | 15 个工具注册 | 各工具 |
| src/agent/tools/types.ts | Tool/ToolCtx/ToolResult/StateScope/Revalidate/SideEffects/ToolErrorCode；结构化 code/hint/truncated/行字节统计；`diffs` 多文件结构化 diff | lib/values |
| src/agent/tools/paths.ts | sandboxPath、sandboxWritePath、assertNotSymlink、allowedRoots、realpathOf（re-export）、sharedDirs；原子写入已移至 `lib/atomic-file.ts` | config/store, lib/platform, lib/realpath |
| src/agent/tools/readers.ts | read/list/grep/walk；行区间读取先按字节预算裁剪、read_many 总预算/逐文件错误隔离/UTF-8 码点边界/提示计入预算、grep glob 与 regex 安全上限/context/maxResults、超长命中行裁剪 500 字节、读取上限 | ignore, limits, lib/glob |
| src/agent/tools/validate.ts | 参数校验、preparePath、prepareWritePath | paths |
| src/agent/tools/shell.ts | shell 工具 + 后台 session 轮询 | shell-session |
| src/agent/tools/apply_patch.ts | 调用 patch 三阶段（async）；review pending 时 fail closed；成功时返回逐文件 `diffs`，fallback 写标记 `atomic:false` | patch/*, lib/values, lib/atomic-file |
| src/agent/tools/{read_file,read_many,write_file,append_file,copy_file,delete_file,list_files,make_dir,move_path,grep,replace_in_file,stat_path,pwd}.ts | 单工具实现；声明 stateScope/revalidate；结构化错误码与 sideEffects；read_file offset/limit、read_many 预算、grep 过滤、replace 计数、copy overwrite、delete recursive、move EXDEV 回退；write/append/copy/replace 目标用 `sandboxWritePath`；write/copy/replace 经 `lib/atomic-file` 原子写（O_NOFOLLOW、FUSE 回读/backup、断开硬链接），append 保持 append 语义并拒绝 `nlink>1`；write/append/replace 返回 oldText/newText/changedStartLine/行数/diffTruncated | paths/readers/validate, lib/values |
| src/agent/protocol.ts | `<fastcode_tool>`/DSML/Hermes-Qwen/Mistral/Kimi/Llama 解析与剥离；`isCallBoundary` 只检查 256 字符后缀；`detectedDialects`；`hasUnexecutedToolMarkup`（围栏外未执行标记）；formatToolResults；AGENT_SYSTEM_PROMPT；检测到标记但 0 调用返回 errors，strip 只删已识别的良构块 | 无 |
| src/agent/protocol-mode.ts | legacy/native/auto 选择；能力缓存；400/422/501 + tool/function 结构降级判定 | model-meta |
| src/agent/tool-schemas.ts | 原生 function-calling JSON schema（15 工具） | types |
| src/agent/guards.ts | 三态危险命令判定；Hard Block/Soft Gate；声明式 shell 权限只作用于 Soft Gate；只读/副作用判定；指纹归一化；FASTCODE_LOOP_EXEMPT | shell-ast, policy/permissions |
| src/agent/policy/permissions.ts | 声明式 shell 权限：全局 config + trusted 项目 `.fastcode/permissions{,.local}.json`；allow/deny glob（`/.../` 可选 regex，绝对 glob 不误判，regex 512 字符/嵌套量词上限），只作用于 Soft Gate；read/edit 尚未实现 | config/store, config/trust, lib/glob |
| src/agent/check-loop.ts | post-write check：静态命令、`FASTCODE_CHECK_FILES`、超时进程树终止、redact、8KB 输出 | process-tree, child-env, tools/types |
| src/agent/shell-ast.ts | 纯 JS `bash-parser` 第二意见；只做 hard 升级；`-c`/`find -exec`/`eval/source/.`/同段赋值 | bash-parser |
| src/agent/approval.ts | ApprovalRequest/Decision、稳定 option id、默认选项、plain 编号解析；feedback 必须有用户文本，否则 fail-closed | 无 |
| src/agent/approval-store.ts | once/session/always 作用域；session 内存；always 绑 catalogHash | approval, trust, guards |
| src/agent/approval-native.ts | termux-dialog sheet resolver；feedback 用 termux-dialog text 收集原因；code/index 严格映射，缺失/超时回落 | approval |
| src/agent/approval-json.ts | NDJSON gate:ask/decision schema、`v:1` 版本与错 id/畸形校验（入站兼容旧 `version`）；feedback 要求 input 并回传用户文本 | approval |
| src/headless.ts | `--ui json` / 非 TTY plain 的无线程 TUI 运行器；NDJSON 由 `agent/event-stream.ts` 统一信封（v/seq/ts/session_id/turn）、reasoning/tool_call/tool_result/egress_denied/gate/notice（plain 写 stderr）；error 事件写 stderr/JSON 并使失败退出码非 0；接 `onProtocolFallback`/`onNativeOk` 持久化能力 | runner, providers, approval-json, protocol-mode, config/store, event-stream |
| src/agent/event-stream.ts | `EventStream` 统一 NDJSON 信封与 `serializeAgentEvent`；reasoning 帧；session_id/turn；TUI 直接消费 AgentEvent，JSON 消费本序列化器 | runner（type）、approval-json |
| src/agent/limits.ts | 边产边截断的工具输出缓冲；`toolMessageLimit`/`boundToolMessage` 作为单条 tool 消息硬上限 | 无 |
| src/agent/stream.ts | runStream：idle 超时、retryStream、incomplete；语义折叠委托 StreamAssembler；`capabilities.retryable:false` 时不重放 | lib/net, types, stream-events |
| src/agent/stream-events.ts | `StreamEvent` 闭集（text/thinking/tool-call/usage/turn-end）；唯一 `StreamAssembler`；`chunkToStreamEvents` 适配旧 ChatChunk；`assertNever` 穷尽检查；usage 重复告警去重 | types, lib/values |
| src/agent/compaction.ts | token 阈值 / heap 强制压缩；短历史动态减少保留尾部以压缩中间消息；摘要落盘与旧文件清理；Notes/Outcomes 优先与 limit marker；server-aware 互斥；摘要采样 64KB、collectFiles 有界、无进展熔断瘦身超限 tool/user 消息 | model-meta, config/paths |
| src/agent/process-tree.ts | 兼容 re-export；实现已移至 `lib/process-tree.ts` | lib/process-tree |
| src/agent/shell-session.ts | 两条路径：resident `sh -s` 池（默认 2，`/threads` ≤6，子 shell 隔离、池满排队）与 one-shot（`FASTCODE_MAX_SPAWN_PER_TURN` 预算、满额立即失败）；每个 job 保留最近 256KB 输出；后台输出隔离、`shutdownShellsAsync`、增量轮询、/jobs /kill 数据源 | process-tree |
| src/agent/ignore.ts | .fastcodeignore、默认忽略、二进制识别；文件 ≤256KB、规则 ≤2000、单条 glob ≤256 字符且 `**` ≤4 | 无 |

## 领域层：patch

| 文件 | 职责 |
|---|---|
| src/patch/parse.ts | Begin/End、Add/Delete/Update/Move、hunk 解析 |
| src/patch/plan.ts | 沙箱/符号链接检查、CRLF/mode 记录、三级模糊匹配、per-file diff、review |
| src/patch/apply.ts | async tmp+O_NOFOLLOW+fchmod；commit 委托 `lib/atomic-file`；多文件失败 async 回滚；mode 告警 |

## 领域层：session

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/session/log.ts | append-only 事实流；seq；checkpoint；close(reason/compaction) + session_end/projection + best-effort fsync；`approval` 决策事实；幂等 close；写失败 stderr + degraded，degraded/日志关闭时跳过 projection/prune；fsync 分层；未闭合扫描；JSONL 0600；剪枝时清理 summary 引用 | config/paths, agent/compaction |
| src/session/projection.ts | 事实→消息；fold 工具载荷、cleared/revert 重置、未配对 tool_call 补全；投影 200KB 硬上限（含 `toolCalls[].arguments` 截断）；dropped marker；fingerprint；resume；summaryRef 限 sessions 内且 ≤256KB | session/log, agent/registry, agent/protocol, config/paths |
| src/session/actions.ts | `applyRevert` / `applyPlan`：追加 fact 后统一重建 projection，供 TUI 只发意图；避免 app 内重复 `resumeSession` | session/log, session/projection, session/plan |
| src/session/instructions.ts | 发现 AGENTS.md/FASTCODE.md（global/项目根/cwd 链），同名近层覆盖远层，32KB/文件（UTF-8 字节）、96KB 总量，生成 system 注入文本与 hash | config/paths |
| src/session/plan.ts | `plan` fact 归一化、最新计划、`[plan]` 格式化；投影保护 | 无 |
| src/session/worktree.ts | git worktree create/list/diff/apply/remove；记录 `fastcode.base`/`fastcode.lastApplied`，diff/apply 含 committed+staged+binary，`--commit` 支持增量重复 apply，未跟踪只提示 | config/paths |

## 领域层：服务商

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/providers/index.ts | PROVIDERS 注册与 probe；`probeProviderDetailed` 返回 `{ok, reason, status}`；解析 baseUrl 占位符，使用 `provider.modelsPath`，`null` 不误报 offline | 各 provider, spec |
| src/providers/spec.ts | URL 模板、pathParams/query、auth 头纯函数；占位符缺失抛错 | 无 |
| src/providers/openaiCompatible.ts | chat/completions 流；URL/头经 spec 参数化；方言重试；tool_calls 归并；idempotency-key；usage 结合 staticModels + providerId-aware model-meta pricing 计算 costUsd；缺 `[DONE]`/`finish_reason` 抛 `IncompleteStreamError`；错误正文脱敏 | lib/http, lib/native-tools, lib/model-meta, spec, child-env |
| src/providers/anthropic.ts | Claude Messages API（伪协议工具）；缺 `message_stop` 抛 `IncompleteStreamError` | lib/http, lib/net |
| src/providers/{openai,google,deepseek,openrouter,groq,mistral,xai,moonshot,zhipu,qwen,ollama,custom}.ts | 13 内置 provider 配置；`custom` 支持 `FASTCODE_AUTH_HEADER`/`FASTCODE_AUTH_PREFIX`/`FASTCODE_EXTRA_HEADERS` | openaiCompatible |
| src/providers/catalog.ts | 42 个 OpenAI 兼容 catalog provider（聚合网关/国内外厂商/云平台占位符） | openaiCompatible, spec |
| src/providers/stdioBackend.ts | CLI 后端基础层：spawn + 规范 NDJSON、环境 allowlist、abort 进程树终止、只提议工具不执行；`index.ts` 在设置 `FASTCODE_STDIO_COMMAND` 时注册为 `stdio` provider，默认不注册 | lib/child-env, lib/process-tree, lib/values, types |

## 领域层：命令（35 个）

| 文件 | 职责 |
|---|---|
| src/commands/index.ts | COMMANDS、findCommand、parseSlash |
| about / cwd / clear / exit / help / config / cost / system / theme / reset | 基本信息与配置 |
| agent / tools | agent 模式与工具说明 |
| model / provider | 统一配置向导入口与参数快捷切换 |
| effort | 思考强度 |
| login / logout / whoami | Key 配置向导入口、provider 级 Key 绑定/登出/状态 |
| skills / plugin | 技能与插件 |
| context | token/阈值/heap |
| cancel / steer / bg / attach / expand / edit | 运行中控制、后台与输入绕行 |
| jobs / kill | 后台 shell 会话 |
| threads (pool) · src/commands/threads.ts | 查看/调整 resident shell 并发（默认 2，上限 6；不影响 one-shot 路径） |
| compact | 强制本地压缩 |
| revert | `/revert <n>` 删除第 n 条 user 消息及之后；`--files` 暂未实现 |
| plan / goal | `/plan`、`/todo` 编辑会话计划；`/goal` 设置目标；落 `plan` fact |
| worktree | `/worktree list/create/diff/apply/remove`；git worktree 隔离；非 git 报错 |

## 领域层：技能与插件

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/skills/manager.ts | 技能列表/安装/卸载/提示拼装；目录 sha256 完整性校验与重新基线 | config/paths, lib/http, skills/parser, node:crypto |
| src/skills/parser.ts | SKILL.md frontmatter | 无 |
| src/plugins/manager.ts | 插件发现/导入/移除/提示拼装；`plugin.json` manifest（name/version/scope/capabilities）；`project` scope 安装到 `<cwd>/.fastcode/plugins`，仅已信任项目加载并优先于全局；默认关；仅支持 prompt/skills，其他能力拒绝 | config/paths |

## 基础层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/config/paths.ts | 目录布局；FASTCODE_HOME；POSIX 数据目录 0700；secret 文件 0600 | lib/platform |
| src/config/store.ts | config/auth/capabilities；provider 级 Key；v1/v2 迁移；原子写；auth tmp 与 `.v2.bak` 0600；`config.json`/`auth.json` 损坏分别保留 `.bak`/`.corrupt.bak` 并提示一次 | paths, themes |
| src/config/themes.ts | 配色主题 | 无 |
| src/config/trust.ts | trust v1（paths/tools）；realpath；mtime memo；旧 trusted[] 迁移 | config/paths |
| src/lib/http.ts | fetchJson、streamSSE（CRLF/UTF-8/idle/NetworkStall）、probeConnectivity；空闲超时与请求层共享；HTTP 错误正文经 `redactSecrets` | child-env |
| src/lib/child-env.ts | 子进程环境 allowlist（默认只含 PATH/HOME/TMPDIR/locale/终端）；stderr 凭据与 ANSI 脱敏 | 无 |
| src/lib/process-tree.ts | 进程组 SIGTERM → grace → SIGKILL；组长退出但组仍存活时继续升级；Windows taskkill /T；供 shell 与后端层共用 | 无 |
| src/lib/values.ts | `assertNever` 穷尽检查辅助；`parseJsonObjectWithRepair`（尾逗号/未闭合字符串/缺括号/单元素数组/已知数值布尔字符串）；`buildStructuredDiff`（old/new 文本、起始行、行数、16KB 截断）、`structuredDiffFields` 统一 ToolResult 字段 | 无 |
| src/lib/atomic-file.ts | 原子写入 seam：`atomicFile.write` / `atomicFile.temp`（Temp.write/fill/commit/discard）/ `atomicFile.backups`；temp 所有权、O_NOFOLLOW、结构错误分类、rename fallback、字节回读、backup 保留、`createAtomicFile(io)` 测试注入 | 无 |
| src/lib/glob.ts | 共享 glob/regex 安全上限（glob 256、`**` ≤4；regex 512、拒绝嵌套量词）；readers/ignore/permissions/grep 共用 | 无 |
| src/lib/net.ts | retryRequest、retryStream（前缀去重）、QuotaError | types |
| src/lib/lifecycle.ts | SIGTERM/SIGHUP + fatal 兜底；shutdownShells 幂等清理 | agent/shell-session |
| src/lib/native-tools.ts | tool_calls 归并与 finalize：有 index 按 index，无 index 按 id/单条目；对象型 arguments 归一为 JSON 字符串 | types |
| src/lib/model-meta.ts | 13 provider 元数据；上下文/charsPerToken/tools/pricing；用户覆盖；`modelMetaSource`/`MODEL_META_UPDATED`/`estimateCostUsd`；estTokens | 无 |
| src/lib/markdown.ts | Markdown → ANSI；常用语言高亮，冷门语言纯文本回退 + 轻提示 | marked, marked-terminal, highlight-subset |
| src/lib/highlight-subset.ts | 仅注册常用 highlight.js 语言；供 esbuild 别名与回退判定共用 | highlight.js/lib/core + languages |
| src/lib/platform.ts | Termux/OS 识别 | 无 |
| src/lib/realpath.ts | 逐组件解析符号链接（含悬空链接）；缺失尾部按词法拼接；循环/深度上限返回 undefined | 无 |
| src/lib/debug.ts | 低流量 stderr 调试日志；`FASTCODE_DEBUG` 开关 | 无 |
| src/lib/uiMode.ts | 稳定 UI / live streaming 判定 | platform |
| src/lib/startup.ts | 欢迎语/缺 Key 提示 | store, providers |
| src/lib/diagnostics.ts | doctor：平台/权限/内存/TMPDIR/请求空闲超时与 SSE 回退/tool 消息上限/custom 认证头/池/协议/未闭合/残留 atomic backup | 多个模块 |
| src/lib/pkg.ts | 读取 package.json 版本 | 无 |
| src/i18n/index.ts | 轻量 i18n：locale 解析（`FASTCODE_LANG` > `config.language` > en）、`t()` 插值与 `{name}` 占位、`setLocale()`；非法语言类型安全回退 | config/store, i18n/catalog |
| src/i18n/catalog/en.ts | 英文基准字符串目录；`MessageKey` 由该对象推导，其他语言必须实现全部键 | 无 |
| src/i18n/catalog/zh.ts | 简体中文目录；`Record<MessageKey, string>` 保证键完整 | i18n/catalog/en |

## 同名 / 命名空间说明（L2）

同名文件不批量改名；用路径前缀区分命名空间：

| 同名 | 命名空间 |
|---|---|
| `types.ts` | `src/types.ts` = 公共类型；`src/agent/tools/types.ts` = 工具契约 |
| `paths.ts` | `src/config/paths.ts` = 数据目录；`src/agent/tools/paths.ts` = 沙箱/工作区路径 |
| `context.ts` | `src/agent/context.ts` 已移除；`src/commands/context.ts` = `/context` 命令 |
| `tools.ts` | `src/agent/tools.ts` = 兼容门面；`src/commands/tools.ts` = `/tools` 命令；`src/agent/tools/` = 工具实现 |
| `manager.ts` | `src/plugins/manager.ts` = 插件；`src/skills/manager.ts` = 技能 |
| `index.ts` | 入口/注册表按目录区分（`src/index.ts`、`commands/index.ts`、`tools/index.ts`、`providers/index.ts`、`i18n/index.ts`） |
| `process-tree.ts` | 实现 `src/lib/process-tree.ts`；`src/agent/process-tree.ts` 仅为兼容 re-export |
| `native-tools.ts` | `src/lib/native-tools.ts` 实际是 OpenAI `tool_calls` 归并器（名字保留，勿按“原生工具”理解） |

## 构建与分发

| 文件 | 职责 |
|---|---|
| package/scripts/build.mjs | esbuild：src/index.ts → dist/cli.js（自包含） |
| package/scripts/esbuild-plugins.mjs | 字体内联、require 垫片、桩依赖、highlight.js 常用语言裁剪 |
| scripts/install.sh / install-termux.sh | 软链 dist/cli.js 到 $PREFIX/bin |
| scripts/build-portable.sh | release/ tar.gz/zip + npm pack + SHA256SUMS |
| scripts/update-termux.sh | 目录/git/npm 更新 |
| scripts/smoke-test.mjs | 回归（当前 PC 447 项 / POSIX 448；Termux 281 项为历史，待复跑） |
| scripts/version-anchors.mjs | 只读扫描当前 package 版本的所有文本锚点；升级版本后用它核对 |
| .github/workflows/release.yml | v* tag：构建资产、GitHub Release、npm publish |
| .github/workflows/verify.yml | push/PR：Node 24、npm ci、npm run check、verify:artifacts、verify-gate、dist 无 modified/untracked |
| scripts/verify-gate.mjs | CI 门禁自检：workflow 关键项、运行时字面量、`--self-test` 反证 |

## 测试与验证

- `npm run typecheck` / `npm run lint` / `npm run build`
- `node scripts/smoke-test.mjs`：当前 **447** 项（Windows；POSIX 448）行为断言（runner、预算、循环、工具契约、
  retry/SSE、checkpoint/projection、compaction、patch、shell、native tools、命令、doctor、错误语义、方言）。
- `node scripts/version-anchors.mjs`：列出当前版本的文本锚点；版本升级后核对是否只改允许位置。
- Termux 真机额外验证：进程组 kill、/sdcard fsync、#50/#51/#54、TUI `/context`、`/edit`。
