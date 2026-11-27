# FastCode 架构说明

> 版本：见 `package/package.json`（0.1.9-beta.2 工作树；基于 0.1.8 + P4–P9 harness；未提交/未发布）
> 适用：`package/src` 当前源码树与 `dist/cli.js` 构建产物
> 维护：改模块、命令、环境变量或安全语义时同步本文件

## 1. 分层

```text
┌─────────────────────────────────────────────────────────────┐
│ 入口层  bin/fastcode.mjs -> dist/cli.js（esbuild 自包含）     │
│                          -> dist/index.js（tsc 回退）        │
├─────────────────────────────────────────────────────────────┤
│ 命令层  cli-main.ts（TUI 之外）+ commands/*（斜杠命令）       │
├─────────────────────────────────────────────────────────────┤
│ 界面层  app.ts + ui/*（Ink/React；只渲染事件，不跑 agent）    │
│         headless.ts（--ui json / 非 TTY plain）             │
├─────────────────────────────────────────────────────────────┤
│ 编排层  agent/runner.ts（async generator）                   │
│         agent/registry.ts + tools/* + agent/policy/*        │
├─────────────────────────────────────────────────────────────┤
│ 领域层  providers/*（含 spec.ts） session/* skills/* plugins/*│
│         agent/guards.ts agent/shell-ast.ts approval*.ts      │
├─────────────────────────────────────────────────────────────┤
│ 基础层  config/*  lib/*（含 lifecycle.ts） patch/*  types.ts │
└─────────────────────────────────────────────────────────────┘
```

原则：

- `agent/runner.ts` 不依赖 React；UI 只消费事件。
- 工具执行统一经过 `ToolRegistry`：prepare → egress → approve → execute。
- Hard Block 在 `guards.ts`，AST 只做第二意见；egress 在 `agent/policy/egress.ts`，默认 `enabled:true + mode:"block"`（内置 `auth.json`/`sessions`）；审批在 `approval*`，不反向改 guard/egress 结论。
- 事实流 append-only；投影可重建；剪枝后仍保留带 manifest 的可验证投影。

## 2. 入口与命令

- `bin/fastcode.mjs`：优先加载自包含 `dist/cli.js`，回退 `dist/index.js` / `src/index.ts`。
- `src/index.ts`：调用 CLI；`--ui json` 走 headless，非 TTY 的 plain 走 headless，其余加载 Ink TUI。
- `src/lib/lifecycle.ts`：安装 SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底，调用 `shutdownShells()`；headless 同时响应 SIGTERM/SIGHUP 中止当前 run。
- `src/cli-main.ts`：meow 参数解析；provider/model/config/sessions/resume/trust/skills/doctor/update、`--ui`。
- `src/commands/*`：斜杠命令纯函数；`/provider`、`/model`、`/login` 无参数统一进入 app 的模型配置向导。CLI 子命令与全部 TUI 斜杠命令速查见 `CONFIGURATION.md` §8。
- `src/headless.ts`：无 Ink 运行器；stdout 只输出 NDJSON 协议/回答，诊断写 stderr。`src/agent/event-stream.ts` 统一信封：每个事件带 `v:1`、`seq`、`ts`、`session_id`、`turn`；`assistant_raw.reasoning` 单独输出 `reasoning` 帧；`tool_call` 与 `tool_result`（含 `output`、`side_effects`、`code`、`truncated`、行/字节统计）按发生顺序输出。

## 3. TUI 与交互

- `app.ts`：会话状态、`runAgent` 事件消费、Picker/Prompt、登录向导、审批 resolver。
- `ui/Picker.ts`：方向键、`1–9`、Enter、Esc；不直接持有权限逻辑。
- `ui/Prompt.ts`、`Message.ts`、`Spinner.ts`、`StatusBar.ts`、`TrustGate.ts`：纯展示组件。
- 模型配置向导：
  - `/provider` → provider Picker → model Picker → key（若 provider 需要）
  - `/model` → 当前 provider 的 model Picker（当前模型预选）
  - `/login` → provider → model → key
  - 取消不提交未完成配置；key 输入掩码；keyless provider 跳过 key。
- 审批交互：
  - `tty`：Ink Picker；默认选项为 deny。
  - `native`：`termux-dialog sheet`；严格校验 code/index，缺失/超时回落 tty。
  - `plain`：文本编号输入；无 TTY 时 headless readline。
  - `json`：NDJSON `gate:ask` / `gate:decision` / `gate:error`，统一 `v:1` 并走同一事件信封（session_id/turn/seq/ts）；stdout 只输出协议。
  - feedback：选择 “Deny with feedback” 后进入文本等待；tty/plain 用 Prompt 输入，native 用 `termux-dialog text`（不可用回落 tty），json 要求 `input` 字段；空输入/缺失输入 fail-closed，不把提示语回传模型。
- Hard Block 不生成审批请求，不显示 Allow/Always/Force。
- 中断/退出保护：`Esc` 取消当前 run 并保留部分输出；run 中 `Ctrl+C` 第一次取消、第二次退出；run 中 `/exit` 需 5s 内二次确认。确认后最多等 1000ms 落最终 facts，再安全停止 shell、写保存口并退出。

## 4. Agent 与工具

- `agent/runner.ts`：单轮/多轮、流式、工具调用、预算、loop detection、compaction、checkpoint、resume 历史。
- `agent/registry.ts`：
  - `prepare → egress → approve → execute`；egress block 直接返回 `EGRESS_DENY`，不生成审批；
  - `stateScope` / `revalidate` 契约断言；
  - shell Soft Gate → `pending` ApprovalRequest；
  - Hard Block 直接 deny；
  - resolver 返回 allow/deny/feedback；无 resolver 或异常 fail-closed；
  - once/session/always 授权经 `approval-store`；always 写入 trust 并绑定 catalogHash。
- `agent/tools/types.ts` / registry：`ToolResult` 带 `code/hint/truncated/totalLines/returnedLines/totalBytes/returnedBytes/filesRead/filesSkipped/matches/oldText/newText/changedStartLine/oldLineCount/newLineCount/diffTruncated/check/egress/sideEffects`；错误码 `ENOENT/EEXIST/EISDIR/INVALID_ARGS/SANDBOX_DENY/APPROVAL_DENY/EGRESS_DENY` 等由 registry 统一映射。
- 后置检查：`registry` 在工具成功且有文件 sideEffects 时运行 `config.checkCommand`（`agent/check-loop.ts`）；只把改动文件经 `FASTCODE_CHECK_FILES` 传入，结果附在 `tool_result.check`，失败/超时**不改变工具 ok**。
- 工具契约：`read_file` offset/limit（1-based）、`read_many` 总字节预算（`maxBytes` 钳制、逐文件错误隔离）、`grep` case/glob（长度/`**` 上限）/context/maxResults、`replace_in_file` expectedMatches、`copy_file` 默认拒绝已存在目标、`delete_file` 目录需 recursive、`move_path` EXDEV 回退；sideEffects 与实际 fs 状态一致。
- `agent/tools/*`：15 个单文件工具；文件工具走沙箱路径；patch 三阶段 parse/plan/apply。`read_file` 的行区间分支先按字节预算裁剪再入结果；`grep` 超长命中行裁剪到 500 字符。
- `lib/diff.ts`：行级 DP 预算 `4_000_000`；超过预算时先剥离公共前后缀，再用唯一行锚点（LIS）继续切分，避免大文件远距改动退化成单个巨 hunk。`ui/DiffPreview.ts` 按完整 hunk 截断，不再从 hunk 中间硬切。
- `runner` 写入 `role:"tool"` 前统一按 `toolMessageLimit()`（默认 1MB）兜底；每轮请求前调用 `pairToolMessages()` 修复悬空 `tool_calls`，abort/loop-detected 提前 break 时对未执行调用补 `role:"tool"` 占位。
- `agent/protocol.ts`：支持 `<fastcode_tool>`、DSML、Hermes/Qwen `<tool_call>`、Mistral `[TOOL_CALLS]`（pre-v11 数组 / v11+ `func[CALL_ID]{...}`）、Kimi K2 section、Llama `<|python_tag|>` 与裸 JSON；解析器返回 `{calls, consumedEnd, errors, detectedDialects}`；残留标签抢救与重复解析防护。`detectedDialects` 非空但 0 调用时返回 `errors`，runner 注入 `protocol_error`，不再静默记 `complete`；参数归一（Hermes 对象 arguments、Mistral 的 `{` 起点、Kimi ID 头取函数名、Llama `parameters`→`arguments`）在解析器内完成。
- `agent/shell-ast.ts`：纯 JS `bash-parser` 第二意见，只升级 hard；只解析 `-c`、`find -exec`、`eval/source/.`、同段一次赋值；解析失败保持形状结果。
- `agent/runner.ts` 事件：`tool_call`、`tool_result`（output/sideEffects/code/truncated/行字节）、`usage`、`notice`、`egress_denied`、`error`、`done`；`assistant_raw` 可携带 `reasoning`（thinking 与可见回答分离，写入会话事实）。持续协议失败使用 `stopReason:"protocol_error"` 并发 `error.kind="protocol_error"`；`incomplete`/`stream_error`/`protocol_error` 在 headless 均以非零退出码结束。重试通过 `notice` 暴露；纯文本收尾走 `done.finalText`（headless 消费契约，见 G2 未决项）。
- native/工具参数：`lib/values.ts` 的 `parseJsonObjectWithRepair` 在 `JSON.parse` 前做一次保守修复（尾逗号/未闭合字符串/缺括号/单元素数组/已知数值布尔字符串）；仍失败时 runner 注入 `INVALID_ARGS` `tool_result` 且**不执行工具**；连续协议错误在合法轮清零，错误事件带 `detail`；0 调用但围栏外正文有标记时在可见文本追加“未执行”提示。
- `agent/event-stream.ts`：`EventStream` 统一信封（`v/seq/ts/session_id/turn`）与 `serializeAgentEvent`；headless JSON 只消费该序列化器；reasoning 单独成帧；gate 协议统一 `v` 字段（仍兼容入站旧 `version`）。
- `agent/stream-events.ts`：`StreamEvent` 闭集（text/thinking/tool-call/usage/turn-end）与唯一 `StreamAssembler`；`runStream` 只负责 idle/retry/abort，语义折叠全部委托给装配器。`assertNever` 保证新增事件变体时所有消费者编译期失败。

## 5. Guardrails

- `agent/guards.ts` 三态：`allow` / `soft_gate` / `hard_block`。
- Hard Block 包括：根/当前/父/home/变量/通配符/系统路径递归删除、源码目录递归删除、`find -delete`、force-push 受保护分支、`git clean -fdx`、`dd of=/dev/*`、mkfs/mke2fs/fdisk/diskpart/format、docker prune/全删、`kubectl delete --all namespaces`、`chmod/chown -R` 根或系统路径、shutdown/reboot/poweroff/systemctl stop、敏感文件（`.env` 家族、`.pem`/`*.key`/`auth.json`/`trust.json`/sessions 等）写入/删除/重命名/清空、敏感文件外传（管道到网络 sink、上传参数、`scp`/`rsync`、`base64`/`tar` 间接外带、共享存储重定向 → `sensitive_file_egress`）、关键凭据读取（`id_*`、`/etc/shadow`、`/etc/sudoers` → `critical-credential-read`）、`curl|sh`、`base64 -d|sh`、非字面量 eval/source/-c、`nc -e`、`/dev/tcp`。
- Soft Gate：普通文件/可重建目录删除、`git reset --hard`、`git clean -fd`、feature force-push、普通 `kubectl` ns/scale、普通 truncate/shred、裸 `printenv`/`env`。
- 声明式权限（`agent/policy/permissions.ts`）：`permissions.shell.allow/deny` 分层（全局 config + 已信任项目的 `.fastcode/permissions.json` / `permissions.local.json`），只作用于 Soft Gate；deny 优先，Hard Block 永不受影响。
- 普通敏感文件（如 `.env`、`auth.json`、`~/.ssh/config`）读取允许；`.env.example` / `.envrc` 显式放行。
- `FASTCODE_ALLOW_DANGEROUS=1` 只绕过 Soft Gate，不能绕过 Hard Block。
- AST 只做升级，不降级；解析失败保持形状匹配结果。

### 5.1 Egress 策略

- `agent/policy/egress.ts` 是纯策略模块；`registry.execute()` 在 prepare 后、approve 前调用，block 态直接返回 `EGRESS_DENY`，不生成审批请求、不写 `trusted.json`。
- 默认 `enabled:true + mode:"block"`：命中即返回 `EGRESS_DENY`；`mode:"audit"` 只记录 `egress_denied` 不改结果；`mode:"off"` 是完整 kill switch。内置不可移除的 `denyPaths` 为 `$FASTCODE_HOME/auth.json` 与 `$FASTCODE_HOME/sessions/`，跟随 `FASTCODE_HOME` 解析。
- 已覆盖出口：工具路径读写/删/复制/移动/patch、工具 payload、shell command 内容标记、工具输出（返回模型前）、NDJSON/TUI/session 事件。
- 模式矩阵：`off` 放行且不审计；`audit` 放行并记录 `wouldBlock`；`block`（`enabled:true`）返回 `EGRESS_DENY`，resolver 不会被调用。outbound 扫描预算耗尽在 block 态 fail-closed；local write 内容只做 head/tail 扫描。
- 分层：shell 重定向到共享存储由 `guards.ts` 无条件硬拦截，独立于 egress 配置；`write_file`/`copy_file` 的共享存储写入走 egress 层，受 `mode` 控制。
- 写路径：`write_file`/`append_file`/`copy_file` 先经 `lib/realpath.ts` 逐组件解析（含悬空链接），再用 `O_NOFOLLOW` 打开；`resume` 只接受 `sessions/` 下的 id/`.jsonl`，projection 拒绝覆盖源文件。
- 原子写入：`lib/atomic-file.ts` 的 `atomicFile.write` 与 `atomicFile.temp`（Temp.write/fill/commit/discard）统一写入协议；temp 所有权归 Temp，rename 失败走 O_NOFOLLOW 覆盖 + 字节回读 + 失败还原，还原失败保留 backup 并由 doctor 报告。
- 未覆盖/边界：provider 网络请求正文、session JSONL 落盘正文、CLI 子命令输出、skills/plugins prompt 注入、TTS/share/clipboard（本轮无这些工具）、debug 日志；shell 路径判定仍是启发式，不是 shell 语义引擎。该策略是应用层防手滑，不是内核级访问控制。

## 6. 会话与恢复

- `session/log.ts`：append-only JSONL；`session_start` / `user` / `assistant_raw` / `tool_call` / `tool_result` / `approval` / `notice` / `egress_denied` / `checkpoint` / `compacted` / `cleared` / `session_end`。`approval` 记决策（decision/scope/requestId/approvalKey），不是授权状态；`trusted.json` 仍是授权源。append 写失败 → stderr + `degraded`，`close()` 幂等且 degraded/日志关闭时跳过 projection/fsync/prune，避免把残缺 JSONL 固化成“已验证副本”。`cleared` 之后的投影只从其后的事实重建；`sessionMetaFromFacts` 只采用首个 `session_start`，避免 resume 追加的新 start 改变 fingerprint。
- `close(info)` 写 `session_end{reason, compaction}`；`compaction` 是预留的压缩承接位（`source` / `summaryRef` / `pending`），当前默认 `none/null/false`。close/剪枝前写 projection，并对 JSONL 与 projection 做 best-effort fsync；`.projection.json` 保存 manifest：
  - `contentHash`：投影内容 sha256
  - `sessionHash`：源事实 sha256
  - `lastFactSeq`：覆盖的最高事实序号
- `ProjectionFingerprint` 固定 4 字段：`toolCatalogHash` / `modelId` / `cwdDigest` / `compactionSource`；`sameFingerprint` 逐字段严格相等，旧 4 字段投影仍可匹配。
- `session/projection.ts`：恢复先校验 manifest，再校验 fingerprint；事实晚于投影则重建；剪枝后只使用校验通过的投影；tool_call/tool_result 配对修复；`notice` 与 `egress_denied` 作为 system 消息保留（不会静默丢弃）。投影目标上限约 200KB、工具结果单条 8000 字符（保留头尾）；`toolCalls[].arguments` 已截断，`overBudget()` 对单条消息也生效，因此 200KB 是硬上限；`summaryRef` 已限制在 sessions 内且 ≤256KB。投影前把工具载荷折叠为“tool + target + ok/error + 关键错误”事实，裁剪时插入 `[projection] N earlier message(s) dropped …` 并保护 summary/compaction marker。
- 剪枝保留投影，删除原始 JSONL；旧格式/无 manifest 投影明确告警，不静默返回空会话；旧 JSONL 无新字段仍可 resume。
- `session/instructions.ts`：从全局数据目录、项目根（`.git`/`package.json`）到 cwd 链发现 `AGENTS.md`/`FASTCODE.md`；按 global → project → local 顺序拼接到 system（在 agent block 之前），每文件 32KB（UTF-8 字节）、总量 96KB 上限；同名文件按近层覆盖远层；`/context` 显示来源。
- `/revert <n>`：新增 `revert` fact 与 `factsAfterRevert`；按第 n 条 user 消息边界截断投影（删除该条及之后），JSONL 保持 append-only；`--files` 文件还原尚未实现。
- `session/plan.ts`：`plan` fact、最新计划与 `[plan]` 受保护 system message；`/plan`（别名 `/todo`）与 `/goal` 修改计划/目标；自动续跑未实现。
- `session/worktree.ts`：git worktree create/list/diff/apply/remove；默认根 `$FASTCODE_HOME/worktrees/<repo>/<slug>`；记录 `fastcode.base`/`fastcode.lastApplied`，diff/apply 含 committed+staged+binary；`apply --commit` 支持增量重复应用；未提交目标先拒绝；dirty remove 需 force。
- `plugins/manager.ts`：外置插件目录 + 可选 `plugin.json` manifest（name/version/scope/capabilities）；默认关；只支持 prompt/skills，其他能力拒绝导入；`scope:"project"` 仅已信任项目加载并优先于全局。

## 7. Provider、流与压缩

- `providers/*`：55 个 provider（13 内置 + `catalog.ts` 的 42 个 OpenAI 兼容条目）；`authEnv` 是 provider 级密钥候选；能力缓存只存在于进程内（旧 `config.capabilities.toolCalling` 不再参与判定）；`FASTCODE_TOOL_PROTOCOL` 默认 `auto`（兼容 provider 走原生，失败降级 `pseudo`）；DeepSeek 默认模型为 `deepseek-flash`（显式 `deepseek-v4-pro` 仍可用）。catalog 中 `runpod/azure/cloudflare/bedrock/vertex` 的 baseUrl 含 `{placeholder}`，由 `providers/spec.ts` 在请求时从环境变量解析。`Provider.transport` 区分 `http`/`stdio`；`providers/stdioBackend.ts` 提供 CLI 后端基础层（规范 NDJSON、环境 allowlist、abort 进程树终止、只提议工具不执行）；未设置 `FASTCODE_STDIO_COMMAND` 时**默认不注册**，设置后由 `providers/index.ts` 注册为 `stdio` provider，详见 `EXECUTION_BACKENDS.md`。`probeProviderDetailed()` 返回 `{ok, reason, status}`：无 `/models` 端点、HTTP 4xx/5xx、超时分别显示，picker 不再把所有失败笼统标成 offline。
- `providers/spec.ts`：URL 路径/query/auth 头模板（`chatPath/modelsPath/query/pathParams/authHeaderName/authPrefix`）；占位符缺失时抛错、不发请求；现有 provider 不传新字段时 URL/header 与旧行为一致；`modelsPath:null` 不发在线列表请求。`custom` provider 额外支持 `FASTCODE_AUTH_HEADER` / `FASTCODE_AUTH_PREFIX` / `FASTCODE_EXTRA_HEADERS`（JSON 字符串头）。`probeProvider` 使用 `provider.modelsPath`，`modelsPath:null` 视为无 `/models` 端点、不误标 offline。
- `lib/http.ts`：SSE 解析、UTF-8 单字节拼接、idle timeout `NetworkStallError`、连通性探测；聊天路径由 `requestIdleTimeoutMs` 传入 SSE 层，与 `stream.ts` 外层共享同一空闲超时；`FASTCODE_SSE_IDLE_MS` 仅作直接调用 SSE 时的回退。`doctor --net` 使用该探测；HTTP 错误正文经 `redactSecrets`。`Provider.capabilities.retryable === false` 时 `runStream` 不重放（stdio/CLI 后端默认如此）。
- `lib/net.ts`：retryRequest / retryStream，前缀去重，`QuotaError`；重试通过 `notice` 暴露（headless JSON 事件 / plain stderr）。`HTTPS_PROXY/ALL_PROXY` 尚未接入 ProxyAgent（已知边界）。
- `agent/compaction.ts`：token 阈值、heap 强制、server-aware 互斥（当前调用方未传 opaque state，实际不改变本地压缩）、summary 落盘与旧文件清理；摘要 section 顺序 Notes → Outcomes → Files → Requests → Actions，超限条目带 marker；参数可由 `FASTCODE_COMPACTION_RATIO` / `KEEP_TURNS` / `SUMMARY_TOKENS` 调整。摘要扫描采样前 64KB，`collectFiles` 字符类有 `{1,240}` 上界；回收率 <10% 时对 >20KB 的 tool/user 消息就地瘦身到 8KB；短历史会动态减少保留尾部以压缩中间消息；headless/prune 已清理 summary。`/compact` 追加 `compacted` fact，`/clear` 追加 `cleared` fact。
- `lib/model-meta.ts`：上下文窗口 / charsPerToken / supportsTools / `pricing`；用户可覆盖；`modelMetaSource()` 区分 override/built-in/default，`MODEL_META_UPDATED` 记录内置快照日期；`estimateCostUsd()` 供 provider 计算 usage 成本。
- `agent/protocol-mode.ts` 的 `native` **仅指 OpenAI `tool_calls` 方言**：请求用 `{type:"function"}` schema、流解析 `delta.tool_calls`/`message.tool_calls`、历史用 `role:"tool"` + `tool_call_id`（均见 `providers/openaiCompatible.ts`）。`NATIVE_PROVIDERS` 白名单外的 provider（Anthropic、Google、custom）在 `auto` 下 fail closed 到伪协议；Anthropic 的 `tool_use`/`tool_result` 与 Gemini 原生 `functionCall` 需要独立 provider adapter（schema 转换 + 流解析 + 历史转换），当前未实现。`native` 强制会绕过白名单，非该方言的 provider 可能 400 或无效；`isNativeUnsupportedError` 按结构判定 `400/422/501 + tool/function`（只影响首次请求，由 `fellBack` 控制），200 但忽略 `tools` 不会自动降级，需 `FASTCODE_TOOL_PROTOCOL=legacy` 手动兜底（旧 `capabilities.toolCalling` 已不再读取）。native 与伪协议解析互斥：native 不注入 `<fastcode_tool>` 语法段，也不把文本标记当调用。`lib/native-tools.ts` 在缺失 `index` 时按 `delta.id`/单条目归并，对象型 `arguments` 归一为字符串；`openaiCompatible.ts` 对非流式 `application/json` 响应直接映射完整 text/tool_calls。

## 8. Shell 与进程树

- `agent/shell-session.ts`：两条执行路径，预算不共享。**resident**：POSIX 非交互命令，`sh -s` 池默认 2、`/threads` 可调至 128；池满时排队；每条命令包在子 shell 中（隔离 `export`/`umask`/`set -e`/`exit`）；含后台操作符时完成标记后回收该 resident。**one-shot**：Windows 或交互/REPL 判定命令，由 `FASTCODE_MAX_SPAWN_PER_TURN`（默认 8/轮，新建速率而非全局并发上限）限制，满额立即失败、不排队。每个 job 保留最近 **256KB** 输出窗口，再加上 runner 的单条 tool 消息硬上限。`shellPoolStats().active` 统计所有运行中 job，`pool/maxPool` 只统计 resident；跨 turn 未结束的 one-shot 仍占并发。详见 `CONFIGURATION.md` §后台 shell。
- 超时/取消统一 `lib/process-tree.ts` 的 `terminateProcessTree`：进程组 `SIGTERM` → grace → `SIGKILL`；ESRCH 视为已退出。`agent/process-tree.ts` 保留兼容 re-export，供 shell 会话与后端层复用。
- 后台任务保留 timeout；转后台只解除前台 AbortSignal。
- `setsid` 后代仍可能逃逸；不扫描 `ppid=1`，错误信息明确边界。
- `shell` 继承完整 `process.env`，与 FastCode 同用户、同 OS 权限；`FASTCODE_SANDBOX`/`FASTCODE_SANDBOX_ROOT` 只是环境标记，不构成隔离。Guardrails 是启发式拦截，不是沙盒；完整权限模型见 `AUDIT.md` §8.9。
- `lib/lifecycle.ts`：SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底，幂等调用 `shutdownShells()`；headless 同时响应 SIGTERM/SIGHUP 中止当前 run。

## 9. 配置、信任、技能

- `config/store.ts`：`config.json` stat 指纹缓存（mtime/size/ctime）；save/verify 显式失效；auth v1/v2 → provider 级 v3 迁移；`config.egress` 默认 `enabled:true + mode:"block"`（内置 `auth.json` + `sessions/` denyPaths）；`config.shellPoolSize` 默认 2，TUI/headless 启动时应用到 resident 池；read limits 见 `CONFIGURATION.md`。`config.json` 解析失败会保留首份副本为 `config.json.bak` 并在 stderr 提示一次；`auth.json` 解析失败保留 `auth.json.corrupt.bak` 并提示一次；`saveConfig` 对文件执行 0600。`config/paths.ts` 的 `ensureDir` 在 POSIX 上将数据目录收紧到 0700，会话 JSONL 以 0600 创建。
- `config/trust.ts`：项目 realpath + tool approval（catalogHash 绑定）；原子写；`fastcode trust --forget <key>`。
- `skills/manager.ts`：技能目录 sha256 manifest；漂移禁用；`/skills verify --confirm` 重新基线；默认 registry 为空。
- `lib/diagnostics.ts`：doctor 输出平台、TMPDIR、内存、auth、session、guard、egress、read limits、缓存、协议、skills；shell pool 行显示 `active · resident/<maxPool> · spawns`（active 含 resident + one-shot，pool 只算 resident）；`doctor --net` 额外探测 registry 连通性。
- `i18n/`：轻量 UI 字符串目录（`catalog/en.ts` 为基准，`catalog/zh.ts` 实现全部 `MessageKey`）；`t(key, vars)` 运行时按 `FASTCODE_LANG` > `config.language` > `en` 解析并做 `{name}` 插值。仅覆盖已抽取的用户可见文案，模型提示词不参与。

## 10. 构建与发布

- `npm run build` = `tsc -p tsconfig.build.json` + `node scripts/build.mjs`。
- `node scripts/verify-artifacts.mjs` 检查 `dist/cli.js` / `dist/agent/guards.js` 的运行时字符串标记；`node scripts/bench.mjs` 记录冷启动/写入/读取/list/grep 基准。已注册 `npm run verify:artifacts` / `npm run bench`。
- `src/cli-main.ts` 不再叫 `cli.ts`，避免 tsc 输出覆盖 `dist/cli.js` bundle。
- esbuild 输出自包含 `dist/cli.js`；`highlight.js` 裁剪为常用语言子集；`bash-parser` 纯 JS。
- 便携包必须包含 `bash-parser` 依赖闭包，否则真机 smoke 直接加载 dist 模块会失败。
- 发布态已知缺口：`package.json.files` 不含 `scripts/`，`npm test` 指向 `../scripts/smoke-test.mjs`；发布前需纳入打包或改测试入口。PR/push 门禁已由 `.github/workflows/verify.yml` 提供（Node 24、`npm run check`、`verify:artifacts`、`verify-gate` 自检、构建后 `package/dist` 无 modified/untracked）。
- 当前正式版版本见 `package/package.json`（基于 0.1.8-beta.4 + 2026-11-21 批次 + yq 第二轮修复）；已构建、提交并发布；`release/`、npm `latest` 与 GitHub Release 为当前正式版，`beta` 仍为 0.1.8-beta.4。
- 发布须有用户明确授权；不得把未发布改动写成已发布。

## 11. 安全边界

- 这是应用层防手滑 + 可回滚，不是内核级访问控制。
- 不能拦截 FastCode 之外的手工命令、静态二进制、直接 syscall、运行时变量展开、shell function/alias、动态生成命令、行为级反弹 shell。
- Hard Block / Soft Gate / AST 的覆盖与限制以 `RUNBOOK.md` 和方案 §4 为准。

## 12. 验证与维护

```text
npm run typecheck
npm run lint
npm run build
node scripts/smoke-test.mjs   # 或在 package/ 下 npm test
npm run verify:artifacts     # 或在 package/ 下
npm run bench
git diff --check
```

当前基线（计数唯一源）：`docs/VERIFICATION_BASELINE.md`（2026-11-27）。

- PC（Windows）：见 `docs/VERIFICATION_BASELINE.md`（当前工作树本地 build）
- Termux 真机：见 `docs/VERIFICATION_BASELINE.md`（历史，待复跑）
- bench（Windows / Node v24.20.0）：cold start 143.74ms、write 200KB 8.86ms、read_many 10×200KB 26.04ms、list 1000 68.19ms、grep 1000 630.06ms
- bench（Termux / Node v26.4.0）：cold start 893.13ms、write 200KB 32.78ms、read_many 10×200KB 82.57ms、list 1000 153.18ms、grep 1000 865.73ms
- 回滚演练：`git archive HEAD` 临时目录中的旧 bundle 可启动（`--version` 正常）
- 2026-11-15 新增用例覆盖单行超长读取、tool 消息硬上限、压缩限界/收敛、无 index 归并/对象参数、悬空 tool_calls、headless 退出码、配额/超时/权限一致性、custom 认证头与 probe modelsPath；失败语义批次覆盖 degraded 会话/幂等 close、审批决策帧、probe 归因、incomplete/terminal latch、`protocol_error`；方言批次覆盖 Hermes/Qwen、Mistral pre-v11/v11+、Kimi K2、Llama tag/裸 JSON；当前版本收尾批次覆盖 #150–#152（400 前缀去重、混排剥离 offset、native 降级 system 同步）。Windows 计数 441（POSIX 448）；Termux 真机计数待复跑。

改 `src` 后必须重新 build 并提交新的 `dist`；仓库内文档以本文件、`MODULES.md`、`CONFIGURATION.md` 与两份 README 为准。离线开发文档归档在 `config/kai`，不上传。

## 13. 对外 SDK 契约（M1 起）

- 契约类型在 `src/public/types.ts` 定义：`TaskStatus` / `RunError` / `RunConfig` / `RunOptions` / `TaskHandle` / `RunResult`；`onEvent` 引用现有 `AgentEvent`，不改事件闭集。
- 错误/状态映射在 `src/runtime/error-map.ts`：`AgentErrorKind` / `AgentStopReason` 全分支映射为公开 `RunError` / `TaskStatus`，新增分支触发编译期穷尽检查（`Record` + `assertNever`）。
- M2 已落地 `runTask()` / `TaskHandle` 封装（`src/runtime/task.ts`）：同步校验、事件 pump、wait/stop、`logPath`/`sessionId`、事实落盘。
- M3 已落地库入口与发布面：`src/lib.ts`、`package.json` 的 `exports`（`.` + `./types`）、`dist/lib.js` / `dist/lib.d.ts` / `dist/public/types.d.ts`；`./runtime` 子路径不提供。
- M4 已落地契约快照（`exports` / 公开 `.d.ts` / NDJSON 信封 + 6 条语义），随 `npm run check` 进 CI；SDK 文档见 `docs/SDK.md`；版本升级与 beta 细则待产品确认。
- H1a-1 已落地 `runTask` 子进程 hook host（`src/hooks/hook-host-runner.ts` + `dispatch.ts`）：lazy start、NDJSON、env allowlist、软/硬超时、崩溃不杀 run；H1b/H1c 已把同一 host 接到 `headless`/TUI（CLI `FASTCODE_HOOKS=1`，默认关）；H1a-2 已实现 TUI warm host + `name:mtimeMs:size` 签名，未变复用、变化重启；headless/SDK 仍按 run 停止。
- H2（2026-11-27）：`logPath` 固定 `<FASTCODE_HOME>/sessions/<id>.jsonl`；`logs/` 只放调试，`state/` 预留且不创建；SDK/CONFIG 文档 + smoke 断言。
- H3（2026-11-27）：执行引擎 = `runAgent`；编排/视图 = `runTask`/`TaskHandle`；CLI/TUI/headless = 消费者；未来 mode 必须做配置/工作流定义，不得向 `runAgent` 增加 mode 分支；评审规则见 `CONTRIBUTING.md`。
