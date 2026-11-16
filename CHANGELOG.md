# 更新日志（Changelog）

本文件记录每个版本的用户可见变化。逐项的技术修复明细见 [PATCHES.md](PATCHES.md)。

## 0.1.8-beta.1（2026-11-15，工作树）

> 状态：工作树版本见 `package/package.json`；基于 0.1.8-beta.0 工作树；仅本地 build 与 PC 回归，未提交、未发布。来源：`yq.txt` 审计整合 + 本项目文档要求。
> `release/` 已生成当前版本资产；npm `beta` 已发布当前版本（`latest` 仍为 0.1.6）；GitHub Release 资产已上传（Release workflow 最后的 npm 步骤可能因版本已手动发布而失败，不影响资产）。

### 0.1.8-beta.1 后续修复（2026-11-16）
- 重复调用：`protocol_error` 同指纹只重发一次；纯外来方言直接 `protocol_error`；只读 loop 阈值 5 且受窗口钳制；`loop_detected` 非 0 退出。
- 解析触发面：围栏/行内示例不执行，行内示例保留原文；非流式 JSON 的 `content` 不再扫工具标记；外来方言需占主导才报 `UNSUPPORTED_DIALECT`。
- native：不再注入 `<fastcode_tool>` 语法段，也不解析文本标记；配对 400 修复 history 后原协议重试；能力缓存只在进程内，旧 `config.capabilities.toolCalling` 忽略。
- 归一化：非终块 `toolCalls` 折算 delta、cumulative 参数覆盖、usage 重复告警、跨方言按 offset 保序。
- 可观测/运行时：`--ui json` 新增 `loop_detected`/`compaction`/`checkpoint`/`summary`（含 `http_request_count`）帧；doctor 输出最近连续重复；headless 正常结束回收 resident shell；shell 输出退出码并显式拒绝 `cwd`。
- 新增 `FASTCODE_STDIO_COMMAND/ARGS/MODEL/ENV_ALLOWLIST`，配置后注册 `stdio` provider（默认不注册）。

### 稳定性 / 限界
- `read_file` 的 `offset/limit` 分支先按字节预算裁剪再入结果：单行超长文件不再绕过 `FASTCODE_READ_MAX_BYTES`。
- runner 写入 `role:"tool"` 前统一按 `FASTCODE_TOOL_MESSAGE_LIMIT`（默认 1MB）兜底；`grep` 超长命中行裁剪到 500 字符；shell 每个 job 保留窗口从 1MB 收紧到 256KB。
- 压缩摘要只采样前 64KB、`collectFiles` 正则加 `{1,240}` 上界；回收率 <10% 时对 >20KB 的 tool/user 消息就地瘦身，修复“每轮必压”。

### 协议 / 失败语义
- 外来方言（Hermes/Qwen/Kimi/Mistral/Llama/antml 等）解析 0 条时返回 `protocol_error`，不再静默记 `complete`；`stripToolCalls` 不再误删外来块。
- 原生流式：无 `index` 的多 chunk 归并为同一次调用；对象型 `arguments` 归一为 JSON 字符串；非流式 `application/json` 响应直接映射完整 text/tool_calls。
- 请求前 `pairToolMessages` 修复悬空 `tool_calls`；abort/loop 提前 break 时为未执行调用补 `role:"tool"` 占位。
- `--ui plain` 的 error 写 stderr、`--ui json` 发出 error 事件；失败进程退出码非 0。headless 补 `onProtocolFallback`/`onNativeOk` 能力持久化。
- 400 `insufficient tool messages` 不再被误诊为配额；`stream_error` 重置 `lastVisible`；`retryStream` 尾部按配额抛 `QuotaError`。

### 配置 / 权限 / 诊断
- `config.json` 损坏时保留 `config.json.bak` 并在 stderr 提示一次；POSIX 数据目录 0700，`config.json` 与会话 JSONL 0600。
- 聊天路径的 SSE 与外层共用 `requestIdleTimeoutMs`，消除 25s/60s 双计时；`doctor` 同时上报请求空闲超时、SSE 回退与 tool 消息上限。
- `custom` provider 支持 `FASTCODE_AUTH_HEADER` / `FASTCODE_AUTH_PREFIX` / `FASTCODE_EXTRA_HEADERS`；`probeProvider` 使用 `provider.modelsPath`，`modelsPath:null` 不误报 offline。
- 注册 `npm run verify:artifacts` / `npm run bench`；`sessions show <不存在>`、`trust --forget` 空值/不存在、非法 model ID 返回非零；初始化错误默认不打印 minified 堆栈。

### 失败语义与方言
- **会话写失败**：`session.append` 失败只写 stderr 并置 `degraded`；`close()` 跳过 projection/fsync/prune，避免把残缺 JSONL 固化成“已验证副本”；`close()` 幂等，重复调用只写一条 `session_end`；`FASTCODE_SESSION_LOG=0` 不再写空投影。
- **审批决策落案**：TUI 写 `approval` fact（decision/scope/requestId/approvalKey 哈希）；headless 无 session log，改发 `gate:decision` 帧；事件与 `trusted.json` 授权状态分离。
- **错误归因**：`probeProviderDetailed()` 返回 `{ok, reason, status}`，区分“无 /models 端点”“HTTP 4xx/5xx”“超时”；picker 显示原因而不是笼统 offline。
- **incomplete**：新增 `error.kind="incomplete"`；stdio 后端收到 `done` 后启用 terminal latch，忽略后续记录。
- **方言扩展**：支持 Hermes/Qwen `<tool_call>`、Mistral `[TOOL_CALLS]`（pre-v11 数组 + v11 `func[CALL_ID]{...}`）、Kimi K2 section（函数名取自 ID 头）、Llama `<|python_tag|>` 与裸 JSON（`parameters`→`arguments`）。
- **结构性防线**：`parseToolCalls` 返回 `detectedDialects`；检测到标记但 0 调用时一律 `protocol_error`，不再静默 `complete`。
- 退出码语义与上述失败路径见 `docs/ERROR_SEMANTICS.md`。

### 执行后端抽象（基础层）
- 新增规范事件闭集 `StreamEvent`（text/thinking/tool-call/usage/turn-end）与唯一 `StreamAssembler`；`runStream` 只负责 idle/retry/abort，文本、thinking、工具调用与 usage 的折叠集中到一处，新增变体由 `assertNever` 编译期提示。
- `ChatChunk` 增加可选 `reasoning`；thinking 不再在归一化层丢失，`assistant_raw` 与会话事实可保留。
- 新增 `providers/stdioBackend.ts`：CLI 以规范 NDJSON 产出文本/思考/工具提议/usage/结束；**工具只提议、宿主执行**；子进程只收 allowlist 环境；stderr 脱敏；abort 先关读取侧再按进程组终止。该后端**默认不注册**，启用范围待定。
- 新增 `lib/child-env.ts`、`lib/process-tree.ts`、`lib/values.ts`；进程树实现下移到基础层，shell 与后端层共用。
- 错误语义补强：持续协议失败使用独立 `stopReason:"protocol_error"` 并让 headless 非零退出；`incomplete` headless 非零；非幂等后端用 `capabilities.retryable:false` 禁止重放；`auth.json` 损坏保留 `.corrupt.bak` 并提示一次。
- 设计说明见 `docs/EXECUTION_BACKENDS.md`。

### 结构治理（L0–L2）
- `docs/MODULES.md` 升格为目录契约：新增/删除源码必须登记、每行写依赖方向、受控上行说明、同名命名空间表。
- 补 `src/lib/debug.ts`、`src/commands/threads.ts`、`src/ui/picker-window.ts` 的登记；修正 `AUDIT.md` 标题与 `LOCALIZATION_REPORT.md` 的说明。
- 仓库内新增 `CONTRIBUTING.md`，内联 `AGENTS.md` 的关键硬约束（clone 后可见）。
- 移除死代码 `src/agent/context.ts` 与死字段 `contextBudgetChars`（含 `dist` 产物）；旧配置中的该字段会被忽略。
- `docs/CONFIGURATION.md` 标注内部变量 `FASTCODE_SANDBOX` / `FASTCODE_SANDBOX_ROOT`。
- 未做目录搬迁；基线同步未执行（本地 HEAD `70eaea9`，`4d2e1c3b` 本地不存在，工作树有未提交改动）。

### 验证
- `typecheck` / `lint` / `build` 通过；Windows `npm test` **ALL PASS (325 checks)**；`verify:artifacts` 通过。Termux 真机未复跑。

## 0.1.8-beta.0（npm beta 已发布）

> 状态：`package/package.json` = `0.1.8-beta.0`；工作树基于 tag `v0.1.7`（`be6e604`）+ 2026-11-09 修复；已在本地 build/打包，并发布到 npm 的 `beta` tag。
> `release/` 已含 0.1.8-beta.0 tar.gz/zip/tgz/SHA256SUMS；npm `beta=0.1.8-beta.0`，`latest` 仍为 0.1.6。GitHub Release 二进制资产因 Actions billing 锁定待补。
> 本版本重点：shell 会话安全与 resident 并发、Esc/Ctrl+C//exit 中断保护、审批 feedback 输入、工具压缩流/投影恢复、版权合规、TUI effort 修复。

### Shell / 并发 / 退出
- resident 池默认 **2**，`/threads <1-6>`（别名 `/pool`）可调大、上限 6；one-shot 由 `FASTCODE_MAX_SPAWN_PER_TURN`（默认 8/轮）单独限制，不排队；两套预算不共享。
- `close` 退出码 0 记为 `done`；resident 命令在子 shell 中执行，`export`/`umask`/`set -e`/`exit` 不跨命令；含后台操作符的命令完成后回收 resident。
- `/exit` 在 run 中需 5s 内二次确认；`Esc` 取消并保留部分输出；run 中 `Ctrl+C` 第一次取消、第二次退出。确认后最多等 1000ms 落最终 facts，`shutdownShellsAsync`（SIGTERM → 等待 → SIGKILL）停止 resident/one-shot，再写 `session_end{reason,compaction}` + projection 并 best-effort fsync。

### 审批
- `Deny with feedback` 现在等待用户输入原因：TUI/plain 文本模式、JSON 要求 `input`、native 用 `termux-dialog text`；空输入/缺失输入 fail-closed，不再把提示语当反馈。

### Egress
- 默认改为阻断：`enabled:true + mode:"block"`；命中返回 `EGRESS_DENY`，不生成审批、不写 `trusted.json`。
- 内置不可移除 `denyPaths`：`$FASTCODE_HOME/auth.json`（密钥）与 `$FASTCODE_HOME/sessions/`（历史对话），读取/复制/移动/改写均拦截；跟随 `FASTCODE_HOME` 动态解析。
- 仍可 `mode:"audit"` 只审计或 `mode:"off"` 完全关闭；shell 命令内的文件路径尚未纳入 `denyPaths`。

### 工具协议
- `FASTCODE_TOOL_PROTOCOL` 默认由 `legacy` 改为 `auto`：兼容 provider（含 DeepSeek）优先原生 `tool_calls`，减少 DSML 标记泄露。
- 原生请求被 400 拒绝时自动降级 `pseudo` 并缓存 `capabilities.toolCalling[provider::model]`；`native` 强制原生、`legacy` 强制伪协议。
- 未知 provider 仍 fail closed 到伪协议。

### Provider catalog
- 新增 42 个 OpenAI 兼容 provider（聚合网关、国内厂商、国际厂商、云平台占位符），总数 **55**（13 内置 + 42 catalog）。
- `runpod/azure/cloudflare/bedrock/vertex` 的 baseUrl 占位符从环境变量解析（`RUNPOD_ENDPOINT_ID`、`AZURE_OPENAI_*`、`CLOUDFLARE_ACCOUNT_ID`、`AWS_REGION`、`GOOGLE_CLOUD_*`）。
- 未验证默认模型的 catalog 条目在 model picker 提供「Enter model ID manually…」；`Replicate`、小米/京东云/天翼云/联通云/快手、`oc2api/work2api` 暂不内置。

### 工具压缩流 / 投影恢复
- `/compact` 写 `compacted` fact（含 `summaryRef`）；`/clear` 写 `cleared` fact；resume 不再复活旧历史。
- 摘要顺序 Notes → Outcomes → Files → Requests → Actions；超限条目带 marker；新压缩清理本会话旧 `summary-*.md`。
- 投影约 200KB、单条 8000 字符保留头尾；工具载荷折叠为「tool + target + ok/error + 关键错误」事实；裁剪插入 dropped marker 并保护 summary marker。
- `sessionMetaFromFacts` 采用首个 `session_start`；`/context` 使用实际 env 配置；新增 `FASTCODE_COMPACTION_RATIO` / `KEEP_TURNS` / `SUMMARY_TOKENS`。

### TUI / 版权 / 文档
- compact 状态栏 `effort` 重复渲染修复，只显示一次。
- Provider/model picker 翻页编号修复：窗口固定 9 行，每页显示 `1`–`9` 连续编号，数字键选择当前可见项；`qwen`/`ollama`/`custom` 等后段 provider 翻页后可见。
- `/theme`、`/threads`、`/agent` 无参数时改用与 `/model`/`/effort` 相同的选择器（9 行窗口、`1`–`9` 选当前页、Esc 取消）；带参数快捷路径保留。
- `/skills enable|disable|info`、`/plugin enable|disable|info` 省略名字时打开选择器；`/attach`、`/kill` 省略 id 时列出后台 shell 会话。删除类命令仍要求显式参数。
- 修复 `fastcode -h`：现在与 `--help`、`help` 输出同一份格式化帮助；帮助内补充数据目录（config/auth/trusted/model-meta/skills/plugins/sessions/cache/logs）说明。
- `fastcode provider <id>` 在 catalog provider 无已验证默认模型时要求同时给 model；TUI `/provider <id>` 进入模型选择。
- `docs/CONFIGURATION.md` §1 补齐数据目录文件职责与备份/清理建议；§8.2 改为逐条斜杠命令说明（31 个）；`docs/DEPLOYMENT.md` 增加仓库/安装目录结构。
- 根 `LICENSE` 与 `package/LICENSE` 保留原始 `Copyright (c) 2026 SimpleLittleDev` + MIT 全文，并补 FastCode-Termux 自有版权行、上游来源与修改说明；README / package README 增加 License 段。
- README / README.zh / package README 补齐 CLI 子命令、TUI 斜杠命令与设置入口；`docs/CONFIGURATION.md` §8 为完整命令速查（含 `/threads`、`/steer`、trust/skills/sessions/doctor/update 等）。

### 验证与未完成
- `typecheck` / `lint` / `build` 通过；Windows `npm test` **292/292**；`verify-artifacts` 通过。
- 已生成 `release/` 0.1.8-beta.0 tar.gz/zip/tgz 与 `SHA256SUMS`；npm 已发布 `beta=0.1.8-beta.0`；GitHub Release 二进制资产因 Actions billing 锁定待补。Termux 真机未复跑。
- 仍未完成：跨会话孤儿 summary 全局 GC、全局并发上限/统一排队、`contextBudgetChars` 死字段、server-aware 实际接线、Termux 真机复跑。

## 0.1.7（2026-11-07 发布）

> 状态：`package.json` = `0.1.7`；本地 git tag `v0.1.7` 指向 `be6e604`。当时的 0.1.7 `release/` 资产已被 0.1.8-beta.0 本地打包替换（仍可从 tag/历史取回）。
> npm 状态：2026-11-09 查询 registry 仍返回 `latest=0.1.6`、`beta=0.1.6-beta`；npm 侧同步需再次核对，不能仅凭 tag 判定。
> 本版本重点：三态 Guardrails、egress 策略、AST 第二意见、审批闭环、工具契约与精准读写、模型配置 TUI、会话 manifest、配置缓存、技能完整性。

**FastCode 0.1.7 已从“单体 TUI”演进为：事件化 runner + 15 工具契约 + 三态 Guardrails + Egress 策略 + AST 第二意见 + 可审批/可回滚的 tool 执行 + 事实流/投影恢复 + 多 provider + Termux 单文件分发。**

### Guardrails
- Hard Block / Soft Gate / allow 三态；Hard Block 不受 `FASTCODE_ALLOW_DANGEROUS`、trust、session/always 影响。
- `.env` 家族写入/删除/重命名/外发为 Hard Block；普通敏感文件读取为 allow/Soft，关键凭据（`id_*`、`/etc/shadow`、`/etc/sudoers`）读取即 Hard Block。
- 敏感文件外传采用 basename + 路径段双黑名单：管道到网络 sink、上传参数、`scp`/`rsync`、`base64`/`tar` 间接外带、共享存储重定向均返回 `sensitive_file_egress`。
- 裸 `printenv`/`env` 为 Soft Gate，定向 grep/外发为 Hard Block。
- 纯 JS `bash-parser` AST 第二意见：只升不降，覆盖 `-c`、`find -exec`、`eval/source/.`、同段一次赋值。
- `nc -e`、`/dev/tcp`、非字面量 `eval/source/-c` 纳入 Hard Block。

### 工具契约与精准读写
- `read_file` 支持 `offset/limit`（1-based 行区间），返回 `totalLines/returnedLines/truncated`；超出 EOF 返回 `NOT_FOUND`。
- `read_many` 受 `FASTCODE_READ_MANY_MAX_BYTES` 总预算约束，返回 `filesRead/filesSkipped/returnedBytes`。
- `grep` 支持 `caseSensitive/glob/context/maxResults`；非法正则在 prepare 期返回 `INVALID_ARGS`，pattern 长度上限 1000。
- `ToolResult` 新增 `code/hint/truncated/totalLines/returnedLines/totalBytes/returnedBytes/filesRead/filesSkipped/matches`；registry 统一映射 `ENOENT/EEXIST/EISDIR/SANDBOX_DENY/APPROVAL_DENY` 等错误码。
- 写删移：`replace_in_file` 支持 `expectedMatches` 与计数回执；`copy_file` 默认拒绝已存在目标，`overwrite:true` 显式覆盖；`delete_file` 目录需 `recursive:true`；`move_path` 在 `EXDEV` 时回退 copy+remove；write/append/make_dir 区分 `created`/`touched`。
- headless NDJSON 增加 `v/seq/ts`、`tool_call`、`tool_result` 的 `output/side_effects/code/truncated` 与行/字节统计、`usage`、`error.code`。

### Egress 策略
- 新增纯策略模块 `agent/policy/egress.ts`，在 `registry.execute()` 的 prepare 后、approve 前判定；默认 `enabled:false + mode:"audit"`，只记录不拦截。
- `mode:"block"` 时敏感写入/删除/复制/移动、关键凭据读取、内容标记、超预算 outbound 输出返回 `code:"EGRESS_DENY"`；不生成审批请求，不写 `trusted.json`。
- 内置敏感 basename/路径、共享存储、内容标记不可由用户配置删除；`denyPaths`/`denyGlobs` 只能追加。`FASTCODE_ALLOW_DANGEROUS`、`FASTCODE_TRUST_ALL`、`sharedDirs` 不能覆盖。
- 工具输出在返回模型前扫描 `denyContentMarkers`；`maxScanBytes` 控制 outbound 扫描预算，超预算在 block 态 fail-closed。
- NDJSON/TUI/session 增加 `egress_denied` 事件；projection 将其保留为 system 消息；`doctor` 输出 egress 段。配置变更即时生效；`mode:"off"` 为完整 kill switch。

### 审批与交互
- Soft Gate 和大 patch 生成 pending；once/session/always、catalogHash 失效、`trust --forget`。
- TUI Picker / termux-dialog / plain 编号 / headless JSON 四种审批模式。
- Hard Block 不生成审批请求，也不显示 Allow/Always/Force。
- Tier 3 备份前置仍未接入（第三批），当前无默认 yes，破坏性动作 fail-closed。

### 模型配置 TUI
- `/provider`、`/model`、`/login` 无参数统一进入 provider → model → key 向导。
- 带参数快捷路径保留；支持方向键/数字/Enter、离线模型列表、手动 model ID、key 掩码、keyless provider 跳过 key。
- DeepSeek 默认模型改为 `deepseek-flash`；内置列表仍含 `deepseek-v4-pro` / `deepseek-flash`。
- Esc 取消不提交未完成配置。

### Provider 请求协议参数化
- 新增 `providers/spec.ts`：URL 模板、`pathParams`/`query`、auth 头纯函数；占位符缺失时抛错、不发请求。
- `openaiCompatible.ts` 的 `StreamOptions` 增加 `chatPath/modelsPath/query/pathParams/authHeaderName/authPrefix`；默认值与旧行为一致。
- 现有 13 个 provider 的请求 URL/header 快照不变；`modelsPath:null` 跳过在线列表；legacy `authHeader` 仍按前缀处理。

### 可靠性与会话
- `timeoutMs` 钳位与 debug 可见性；后台任务转后台保留超时，SIGTERM → grace → SIGKILL。
- 配置缓存使用 mtime/size/ctime 指纹；save/verify 失效。
- projection 保存 manifest（contentHash/sessionHash/lastFactSeq）；剪枝 → 回收 → 恢复保持工具配对。
- `lib/lifecycle.ts` 统一安装 SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底；headless 同时响应 SIGTERM/SIGHUP 中止。
- 流式重试通过 `notice` 事件可见（TUI + headless JSON；plain 写 stderr）；`doctor --net` 增加 registry 连通性结论。
- `/jobs` 显示会话年龄与 10 分钟回收提示；projection 保留 `notice` 与 `egress_denied` system 消息。
- 真机测试发现的 G1 已修复：`headless.ts` 的 json/plain 分支补 `notice` 映射（JSON 发 `{event:"notice"}`，plain 写 stderr）。
- 新增 `package/scripts/bench.mjs` 与 `package/scripts/verify-artifacts.mjs`（文件已入库；`package.json` 的 `bench` / `verify:artifacts` 脚本注册仍待补，当前需直接 `node` 调用）。
- 技能目录 sha256 完整性锁定；`/skills verify --confirm` 重新基线。
- 语法高亮裁剪常用语言，冷门语言纯文本回退 + 提示。

### 验证
- PC：2026-11-09 在 `HEAD=be6e604` 复跑 `npm test`，`ALL PASS (275 checks)`，exit 0；`node package/scripts/verify-artifacts.mjs` 通过（`dist/cli.js` 与 `dist/agent/guards.js` 各 5 个守卫标记，bundle 2,138,499 B）。
- 构建态记录：`typecheck` / `lint` / `build` 通过；Termux 真机（LG V409N / Android 12 / arm64）smoke **281/281**（2026-11-06，G1 修复后；修复前 279/279）。
- 回滚演练：`git archive HEAD` 到临时目录后旧 `bin/fastcode.mjs --version` 正常启动。
- bench（Windows / Node v24.20.0）：cold start 143.74ms、write 200KB 8.86ms、read_many 10×200KB 26.04ms、list 1000 68.19ms、grep 1000 630.06ms。
- 真机已验证 TUI、审批 Esc/allow once、模型配置向导取消不改配置。

### 发布状态与已知限制（0.1.7）
- 发布：本地 tag `v0.1.7` 与 `release/` 0.1.7 资产已就位；GitHub Release / npm 的实际同步以外部查询为准。
- 未覆盖的 egress 出口：provider 请求正文、session JSONL 落盘正文、CLI 子命令输出、skills/plugins prompt、TTS/share/clipboard、debug 日志；shell 路径仍依赖启发式 guards。
- 尚未接入：`/egress list|add|test` 命令；`doctor` 仅输出 egress 计数，无 `recentDenied`；`HTTPS_PROXY`/`ALL_PROXY`（ProxyAgent）代理；Tier 3 备份前置；写路径 realpath/lstat 的 TOCTOU 复核；ReDoS 执行超时/子进程隔离。
- CI：`.github/workflows/release.yml` 仍只在 `v*` tag / 手动触发，未加 PR 门禁（typecheck/lint/smoke/产物一致性）。
- 脚本：`bench.mjs` / `verify-artifacts.mjs` 已存在，但 `package.json` 未注册 `bench` / `verify:artifacts`；`npm test` 指向上级 `../scripts/smoke-test.mjs`，安装态/发布包不可用。
- 运维入口：`doctor --json`、`sessions export/rm/prune`、TUI `/sessions`、子命令 `--json` 尚未补齐；现有 `sessions` / `sessions show` / `resume` / `doctor --net`。

## 0.1.6-beta（测试版）

> 状态：`package.json` = `0.1.6-beta`；GitHub Release `v0.1.6-beta`（prerelease）
> 与 npm `@datename/fastcode-termux@0.1.6-beta`（dist-tag `beta`）已发布。
> 改动明细、迁移与回滚见 [docs/DEVLOG.md](docs/DEVLOG.md) 与 [LOCALIZATION_REPORT.md](LOCALIZATION_REPORT.md)。

### 工程改造（2026-10-23）
- **runner 拆分**：`agent/runner.ts` 纯 async generator；app 只消费事件。
- **工具契约**：registry + 15 个单文件工具；`stateScope`/`revalidate` 启动断言；trust v1。
- **恢复**：checkpoint、事实流、`projection.json`、resume 恢复 cwd/provider/model、未配对 tool_call 补全。
- **可靠性**：SSE idle、前缀去重重试、`QuotaError`、本地压缩（token/heap）、`/context`。
- **补丁**：parse→plan→apply、三级模糊匹配、CRLF/mode 保持、符号链接拒绝、per-file diff。
- **后台 shell**：2s 后返回 session、POSIX 常驻池、增量轮询、`/jobs` `/kill`。
- **双轨协议**：原生 tool_calls + 400 降级伪协议 + `capabilities.toolCalling`。
- **手机交互**：`/cancel` `/steer` `/attach` `/compact` `/expand` `/edit`，工具输出折叠，doctor 扩展。
- **测试**：PC smoke 115；Termux 120/120；真实 DeepSeek Flash 文本与工具轮次通过。

### 已知限制（0.1.6-beta）
- Ink 5.x IME 光标定位未根治；Termux pty 尺寸异常时会出现 `abcdef` → `bcdefa`/右侧裁切，
  修正 pty 后基本输入通过。`/edit` 可绕行，彻底修需 Ink ≥6.7。
- string-width 仍有 4.2.3 / 5.1.2 / 7.2.0 三份。
- approval pending UI/resolver 未实现（fail closed）。
- 原生 tools 仅覆盖 OpenAI 兼容 provider。

### 新增
- **思考强度 `/effort`**：`auto / low / medium / high / max`。OpenAI 兼容系发 `reasoning_effort`，OpenRouter 发 `reasoning.effort`，Anthropic 发 `thinking.budget_tokens`；不支持的服务商会明确提示忽略。状态栏显示当前档位。
- **交互式 `/model`、`/provider`**：方向键、数字直选、Enter 确认、Esc 取消；联网拉取与本地清单合并去重，离线时标注 `(offline)`。旧用法 `/model <id>` 保留。
- **`config.sharedDirs`**：在 `config.json` 中持久配置额外可读写目录（相对路径、`~/`、绝对路径）。
- **`.fastcodeignore`**：目录遍历与 grep 支持忽略规则；默认忽略 `node_modules`、`.git`、`dist`、`build` 等。
- **读取/搜索上限**：`read_file` 默认 200KB 截断；`grep` 跳过 >1MB 与二进制文件；`list_files` 默认输出目录摘要 + 符号，`detail:true` 可回退全量。

### 变更
- **auth.json v3**：Key 改为**按 provider 保存**，同一服务商切换模型不再重复输入。v1/v2 首次读取自动迁移，原文件备份为 `auth.json.v2.bak`。
- **agent 循环**：工具轮次上限 8 → 24（`maxAgentTurns`）；新增 60s 空闲超时（`requestIdleTimeoutMs`）与零输出重试；断流或到上限时保留历史并提示“输入 继续”。
- **上下文压缩**：超过 `contextBudgetChars`（默认 400k 字符）时压缩中段，保留首条请求与最近 6 条消息，并插入 `[context compacted]` 标记。
- **stable UI**：spinner 不再冻结，改为 120ms 低频转动；文案区分思考中 / 返回中 / 等待工具。

### 修复
- **`apply_patch` 路径逃逸**：补丁目标未走沙箱校验，`*** Update File: ../x` 可越界写文件。已改为与其它文件工具一致的 `sandboxPath()`。
- **长对话截断**：硬编码 8 轮、无超时、断流当完成、历史无压缩导致对话被截断。
- **smoke test 污染真实目录**：测试在模块加载后才设置 `FASTCODE_HOME`，会写入真实的 `~/.fastcode`；已改为启动前隔离。

### 验证
- `npm run typecheck`、`npm run build` 通过；`dist/cli.js` 2.55 MB。
- `node scripts/smoke-test.mjs` **31/31**；额外 28 项行为校验通过（沙箱逃逸、迁移、压缩、推理参数、空闲超时、选择器）。

### 已知限制
- `shell` 工具仍可执行真实命令并访问沙箱外路径（原设计）；文件工具才受沙箱限制。
- 同一 provider 多把不同旧 Key 时，迁移只保留 `addedAt` 最新的一把（有备份）。
- `lockdown()` 失败仍静默（审计 M-3）；技能安装仍缺来源确认（审计 M-4）。

## 0.1.6

发布时间口径：GitHub Release `v0.1.6`；npm 包 `@datename/fastcode-termux@0.1.6`（**首个发布到 npm 的版本**）。

> 说明：`0.1.5` 曾打过 GitHub tag，但那份是不完整的中途构建（缺少包名迁移、模型清单修复、DSML 支持等），也**未发布到 npm**。`0.1.6` 是这些改动的完整版本，并首次发布到 npm。

### ⚠️ 包名变更
- npm 包名由 `@simplelittledev/fastcode` 迁移为 **`@datename/fastcode-termux`**（发布到自有 scope）。
- 安装/卸载/更新命令随之更新；`README`、`docs/DEPLOYMENT.md`、`scripts/*`、`package/README.md` 同步。
- 历史致谢（原作者 SimpleLittleDev 与原 npm 链接）保留不变。

### 新增
- **API Key 作用域化**：Key 绑定到「服务商 + 模型」(`<provider>::<model>`)，只有当前 provider 与 model 同时匹配才使用；换模型不会误用别的 Key。旧 provider-only 键识别为 `legacy`，**不静默使用**，`doctor` 显示 `UNBOUND`。
- **引导式 `/login`**：服务商 → 模型 → Key（输入掩码）。保存后回显 服务商 / 模型 / Key 尾号（`sk-****abcd`）/ 文件路径。也支持一行式 `/login <provider> <model> <key>`。
- **发送前校验**：无可用 Key（或仅 legacy）时拦截并给出精确命令；服务商 401/403（鉴权）与 402/429（额度/限流）分开提示。
- **DSML 工具调用方言**：除 `<fastcode_tool>` 外，解析 DeepSeek 等模型的原生 `<｜DSML｜invoke …>` 标记（兼容 fullwidth/ASCII 竖线、重复/带空格、`calls`/`tool_calls`/`function_calls`、含不含外层块）。
- **实时模型列表为准**：`/models` 成功时只显示服务商当前返回的模型（已知的补标签/价格），离线/失败才回退内置清单。
- **Anthropic 实时模型列表**：`listModels` 先查 `/v1/models`，失败回退内置。
- **CI 自动发布 npm**：`.github/workflows/release.yml` 增加 `npm publish` 步骤（推 `v*` tag 或手动 Run workflow，需仓库 Secret `NPM_TOKEN`）。

### 变更
- 版本：`0.1.4` → **`0.1.6`**（`package.json`、`package-lock.json`、`README`、docs 全部对齐）。
- 安装口径：优先「克隆 + 软链自包含产物」或「便携包」；方式三改为明确的“从源码重建”路径；FAQ 说明 npm registry 可能滞后于仓库。
- 移除“上游仓库已删除”的措辞；删除香港大学（HKUDS）出处段落与相关说明。

### 修复
- **提示符光标前移**：`Prompt` 去掉 500ms 定时重绘（改为静态光标），避免首字符后光标偶发窜位。
- **下架模型长期残留**：`listModelsHttp` 不再把“内置里有、服务商已下架”的模型追加回去（例如 `deepseek-chat` 永不清除的问题）。
- **DeepSeek 内置/默认模型陈旧**：更新为 `deepseek-v4-pro` / `deepseek-flash`（以官方实时列表为准）。
- **DSML 工具调用不执行**：此前会被当普通文本显示，现能解析并真正执行。

### 分发
- `release/` 资产纳入版本库：`datename-fastcode-termux-0.1.6.tgz`、`fastcode-portable-0.1.6.tar.gz`、`SHA256SUMS`（`.gitignore` 只跟踪归档与校验和，忽略解压目录）。
- `release.yml`：Release 步骤仅在 `v*` tag 时执行；`npm publish` 步骤在 tag 或手动 Run workflow 且配置 `NPM_TOKEN` 时执行。

### 验证
- `npm run check` 全过（typecheck + lint + build + 冒烟，冒烟 **31 项**）。
- **真机实测**（LG V409N，Android 12，aarch64，Termux 0.118.2，node v26.4.0）：
  - 安装/`doctor`/`fastcode model` 正常；识别 Termux、stable UI；
  - 引导式 `/login`（服务商 → 模型 → 掩码输入）→ 保存回显 服务商/模型/`sk-****xxxx`/路径；
  - 作用域：精确命中 file、换模型回退出 env、无 env 则 `missing`（拦截）；
  - 实时模型列表只显示 `deepseek-flash`、`deepseek-v4-pro`；
  - 真实模型调用返回 `PONG`；DSML 解析自测通过。

### 涉及的主要文件
- `package/src/config/store.ts`、`src/commands/{login,logout,whoami}.ts`、`src/app.ts`、`src/ui/Prompt.ts`、`src/types.ts`
- `package/src/providers/{openaiCompatible,deepseek,anthropic}.ts`
- `package/src/agent/protocol.ts`
- `package/src/lib/{startup,diagnostics}.ts`、`src/cli.ts`
- `.github/workflows/release.yml`、`.gitignore`、`scripts/{smoke-test.mjs,build-portable.sh,update-termux.sh}`
- 文档：`README.md`、`README.zh.md`、`docs/{CONFIGURATION,DEPLOYMENT,ARCHITECTURE,MODULES}.md`、`PATCHES.md`、`package/README.md`

### 本版本提交
| Commit | 说明 |
|---|---|
| `ba65910` | Fix prompt caret jumping one column after the first keystroke |
| `4b1c040` | Docs: point users at the committed bundle, not npm; publish npm on tag |
| `208ed6e` | Scope API keys to provider + model, add guided /login, bump to 0.1.5 |
| `0ed90a7` | Rename the npm package to @datename/fastcode-termux |
| `a8b0d20` | Drop deleted-upstream wording and the HKUDS attribution |
| `1f19064` | Make the live /models list authoritative; refresh DeepSeek/Anthropic models |
| `bbb42c3` | Also parse DeepSeek's DSML tool-call dialect |
| `ea89317` | Add CHANGELOG.md summarizing the 0.1.5 changes |

### npm 发布过程与结论（0.1.6）

- 发布方式：CI 在 `v*` tag（或手动 Run workflow）时自动 `npm publish`；也可本地 `cd package && npm publish --access public`。
- 现象：全新包首次发布会先出现占位版本 **`0.0.0-stage`**，npm 提示
  `Your package is being processed and may take a few minutes to become available.`；
  几分钟后目标版本正式上线（`dist-tags.latest` 变为 `0.1.6`）。这是 npm 对全新包的正常处理窗口，**不是失败**。
- 校验：`npm view @datename/fastcode-termux version` → `0.1.6`。
- 凭据注意：
  - 能"免 OTP"的 token 才可用于无人值守 CI；而 npm 正在**收紧**这类 2FA-bypass token
    （通知：`npm tokens that bypass 2FA are being restricted ... for direct publishing`）。
  - **已改为优先 Trusted Publishing (OIDC)**：在 npm 包设置里关联本仓库 + `release.yml` 后，
    CI 无需长期 token；未配置 OIDC 时回退用仓库 Secret `NPM_TOKEN`。

> 更早的修复（0.1.3 → 0.1.4 及逆向重建源码树等）见 [PATCHES.md](PATCHES.md)。
