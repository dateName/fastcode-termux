# 错误语义与退出码

> 状态：2026-11-22。本文是失败路径的权威说明；工具/守卫/审批细节仍以 `ARCHITECTURE.md`、`CONFIGURATION.md` 为准。

## 1. 原则

1. **业务结果看 `done.stopReason`**；退出码只承担「进程级异常通道」。
2. **不把所有 `aborted` 统一成 130**。`aborted` 有三个来源（`/cancel`、headless 的 SIGINT、TUI 的 Ctrl+C），只有明确的 SIGINT 语义才适合 130；当前 headless 未记录中断来源，因此统一为 1。
3. **`max_turns` 视为非失败**（退出码 0）；需要严格区分时由调用方读 `done.stopReason`。
4. **工具失败不改变退出码**。`tool_result.ok=false`（含审批拒绝、egress、沙箱、文件系统错误）是对话内可恢复结果，由模型决定下一步。
5. **fallback 写成功仍是成功，但不是原子成功**。`tool_result.ok=true` 且 `atomic:false` 表示 rename 不可用、走了 best-effort copy；退出码不变，TUI/headless 必须显示提示。

## 2. stopReason → 退出码

| stopReason | error.kind | 退出码 | 说明 |
|---|---|---|---|
| `complete` | — | 0 | 正常结束 |
| `max_turns` | — | 0 | 轮次上限；续跑提示在 finalText |
| `token_budget` | `token_budget` | 1 | 预算耗尽 |
| `cost_budget` | `cost_budget` | 1 | 成本预算耗尽 |
| `loop_detected` | `loop_detected` | 1 | 重复调用终止 |
| `aborted` | `aborted` | 1 | 用户取消/信号；不统一 130 |
| `stream_error` | `stream_error` | 1 | 不可恢复的流/网络/配额错误 |
| `incomplete` | `incomplete` | 1 | 流提前结束；保留部分文本。HTTP SSE 缺 `[DONE]`/`finish_reason`（Anthropic 缺 `message_stop`）时按 `incomplete` 处理（B2-04 已修） |
| `protocol_error` | `protocol_error` | 1 | 持续坏标记/坏参数，未能产出有效调用 |

`--ui plain` 与 `--ui json` 共用该映射；`plain` 的错误写 stderr，`json` 发 `error` 事件并以 `done.stopReason` 收尾。
`cost_budget` 依赖 `model-meta` 的 `pricing`（内置已知模型或用户覆盖）；未知模型不会累计 `costUsd`。

### 2.1 native 参数与协议计数（2026-11-21 工作树）

- **参数修复**：`JSON.parse` 前做一次保守修复（尾逗号、未闭合字符串、缺 `}`/`]`、单元素数组包裹、已知数值/布尔字段的字符串形态）；仍失败则按错误处理，不构造无参调用。
- **native 参数失败**：写入 `tool_result{ok:false, code:"INVALID_ARGS"}`，工具**不执行**；连续 2 次 native 参数失败停止 `protocol_error`。
- **计数**：`consecutiveProtocolErrors` 在合法调用/正常完成轮清零；`max_turns` 仅当**最后一轮仍失败**时才改判 `protocol_error`。
- **错误归因**：`error` 事件可带 `detail`（最后一次具体协议/参数错误）；`protocol_error` 的 `finalText` 不再重复错误文案，避免 TUI/headless 双份。
- **未执行标记**：0 调用但围栏外正文含工具标记时，在可见文本追加“未执行”提示；围栏内示例不提示。该提示不写 notice/facts。
- `stopReason` 与退出码不变：`protocol_error` 仍为 1。

## 3. headless 信号

- `headless.ts` 注册 `SIGINT`/`SIGTERM`/`SIGHUP` 的 abort；但 `index.ts` 先安装 `lib/lifecycle.ts` 的进程守卫，信号可能先以 143 退出、headless 的 abort 处理器来不及运行（见 `AUDIT.md` §八 B2-11）。
- `--ui json` 由 `agent/event-stream.ts` 统一信封：`v:1`、`seq`、`ts`、`session_id`、`turn`；新增 `reasoning` 帧；保留 `loop_detected`（fingerprint/occurrences/warned）、`compaction`、`checkpoint`（turn/cwd/provider_id/model/active_files）与收尾 `summary`（tool_call_count/http_request_count/last_turn）（方案 §4 #138、#141）。`gate:ask`/`gate:decision`/`gate:error` 统一 `v:1`，入站仍兼容旧 `version`。
- `session_id` 目前是本次 headless run 的标识（`resume` 时取会话文件名）；headless 仍不写 session log，跨调用持久化留待后续批次。
- `summary.http_request_count` 统计成功返回的模型请求轮数（`assistant_raw` 事件），不含 provider 内部 400 重发。
- 如果以后要把 SIGINT 映射为 130，必须在 headless 记录中断来源，而不是给所有 `aborted` 加 130。

## 4. 会话写失败（degraded）

- `session.append()` 写失败时：stderr 提示一次、进程级 `degraded` 标志、返回 0；**不走 `pushSystem`**（否则会递归触发同一写入）。
- `close()` 在 degraded 或 `FASTCODE_SESSION_LOG=0` 时**跳过 projection / fsync / prune**：残缺 JSONL 不能被固化成「已验证副本」。
- `session.close()` 幂等：重复调用只写一条 `session_end`。

## 5. 审批

- **事件 ≠ 授权**。TUI 决策写 `approval` fact：`decision + scope + requestId + approvalKey`（sha256 前 8 位）；`trusted.json` 仍是授权状态，不由该 fact 推断。
- headless 没有 session log：只发 `gate:decision` 帧（含 decision/error），不落盘。
- pending 是策略判定，不塞进同一个 fact；deny/feedback 的文本仍以 `tool_result` 呈现。

## 6. 方言检测

- 支持的文本方言：`<fastcode_tool>`、DSML、Hermes/Qwen `<tool_call>`、Mistral `[TOOL_CALLS]`、Kimi K2 section、Llama `<|python_tag|>` / 裸 JSON。
- 每个检测器都会写入 `detectedDialects`；**检测到标记但 0 调用 → `protocol_error`**，禁止记 `complete`。
- 不支持的外来标记只在「整段基本由标记构成」时报 `protocol_error`，并带稳定码 `UNSUPPORTED_DIALECT`（`ToolCallParseResult.errorCodes`）；长散文中的行首示例不报错（方案 §4 #142）。doctor 从最新 session facts 统计连续相同 `tool_call` 的最大次数（方案 §4 #140）。
- 方言/不支持标记且 0 调用时只报一次 `protocol_error` 并结束本轮，**不再注入 `protocol_error` tool_result 重发**；`<fastcode_tool>` 坏标记同一错误指纹最多重发 1 次，第二次直接 `protocol_error` 熔断。
- 只读 loop 阈值默认 5，且读写阈值都被 `window`（默认 5）钳制；先警告、第二次累计才终止。
- 参数归一：Hermes/Qwen 的 `arguments` 是对象；Mistral v11 的 `{` 同时是参数起始；Kimi 函数名从 `functions.{name}:{idx}` 提取；Llama 的 `parameters` 归一为 `arguments`。
- 终端 latch：stdio 后端收到 `done` 后忽略后续记录，避免结束后再追加工具调用。
- 触发面：Markdown 围栏（``` / ~~~）内的标记不解析、不 strip；方言标记只在行首或相邻工具段边界生效，行内示例保持文本（方案 §4 #127–#128）。
- 非流式 JSON：只有 `message.tool_calls` 映射为调用；`message.content` 经 `ChatChunk.suppressPseudoParse` 保持纯文本，不进入伪协议解析（方案 §4 #129）。
- native 降级判定：只有 4xx + tools/functions + unsupported/unknown/invalid 才降为 pseudo；`tool_calls must be followed by tool messages` 属 history 形状错误，修复配对后原协议重试一次（方案 §4 #131–#132）。
- 能力缓存：fallback/native 确认只写进程内 `rememberToolCapability`，不落 `config.json`，旧 `config.capabilities.toolCalling` 不再参与判定（方案 §4 #133、#146）。
- 双协议互斥：native 轮次不注入 `<fastcode_tool>` 语法段，也不解析文本标记；同一回复里的文本标记只作为可见内容（方案 §4 #143）。
- 可见文本：行内示例与围栏一样保留原文；只有行首/相邻调用段被剥离（方案 §4 #144）。跨方言调用按文本 offset 排序执行（方案 §4 #145）。
- headless 正常结束后调用 `cleanupProcesses()` 回收 resident shell；有残留 shell 也不会挂住进程（方案 §4 #147）。
- 非流式 400 重发：兼容参数（含 reasoning）每次请求最多再发一次，不链式叠加，总量 ≤2 次 HTTP（方案 §4 #139）。
- native 运行时降级后，后续请求的 system 同步切回 legacy 文本语法段，调用方自带的 system 前缀保留（方案 §4 #152）。
- 混排方言剥离时 boundary offset 以当前正在替换的字符串为准，跨方言调用不再留下可见标记（方案 §4 #151）。
- 400 响应体若自带 `400 Bad Request:` 前缀，provider 不再重复拼接（方案 §4 #150）。

## 7. 验收

- Windows smoke **447/447**（2026-11-22，Node 24；POSIX 448）；用例覆盖 degraded 会话、幂等 close、审批决策帧、probe 错误归因、incomplete error 事件、terminal latch、五种方言、`protocol_error` 熔断、只读 loop 终止（方案 §4 #123–#126）、围栏/行内示例、非流式 JSON、边界调用（方案 §4 #127–#130）、配对 400/native 结构判定/进程级能力缓存（方案 §4 #131–#133）、headless 不落盘/累计参数/非终块调用/usage 告警/汇总帧（方案 §4 #134–#138）、400 重发上限/doctor 重复计数/summary 请求数/方言比例与稳定码（#139–#142）、双协议互斥/行内可见/跨方言保序/旧 capabilities 忽略（#143–#146）、headless 回收/shell 退出码与 cwd/stdio 注册（#147–#149）、400 前缀去重/混排剥离无残留/降级 system 同步（#150–#152）、参数修复/native 无参不执行/连续失败计数/错误 detail/未执行标记提示、统一事件信封/session_id/turn/reasoning/gate v:1、pricing/source/costUsd、结构化 diff、指令发现/声明式权限/回滚边界/后置检查、外置插件 manifest/plan-todo/worktree。
- `typecheck` / `lint` / `build` / `verify:artifacts` 通过。
- Termux 真机与真实 provider 端到端仍待复跑。
