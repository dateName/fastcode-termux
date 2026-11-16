# 错误语义与退出码

> 状态：2026-11-16。本文是失败路径的权威说明；工具/守卫/审批细节仍以 `ARCHITECTURE.md`、`CONFIGURATION.md` 为准。

## 1. 原则

1. **业务结果看 `done.stopReason`**；退出码只承担「进程级异常通道」。
2. **不把所有 `aborted` 统一成 130**。`aborted` 有三个来源（`/cancel`、headless 的 SIGINT、TUI 的 Ctrl+C），只有明确的 SIGINT 语义才适合 130；当前 headless 未记录中断来源，因此统一为 1。
3. **`max_turns` 视为非失败**（退出码 0）；需要严格区分时由调用方读 `done.stopReason`。
4. **工具失败不改变退出码**。`tool_result.ok=false`（含审批拒绝、egress、沙箱、文件系统错误）是对话内可恢复结果，由模型决定下一步。

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
| `incomplete` | `incomplete` | 1 | 流提前结束；保留部分文本 |
| `protocol_error` | `protocol_error` | 1 | 持续坏标记/坏参数，未能产出有效调用 |

`--ui plain` 与 `--ui json` 共用该映射；`plain` 的错误写 stderr，`json` 发 `error` 事件并以 `done.stopReason` 收尾。

## 3. headless 信号

- `headless.ts` 只注册 `SIGINT`（`abort.abort()`）；`SIGTERM`/`SIGHUP` 由 `lib/lifecycle.ts` 兜底。
- `--ui json` 新增独立帧：`loop_detected`（fingerprint/occurrences/warned）、`compaction`、`checkpoint`（turn/cwd/provider_id/model/active_files）与收尾 `summary`（tool_call_count/http_request_count/last_turn）；全部带 `v/seq/ts`（方案 §4 #138、#141）。
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
- 能力缓存：fallback/native 确认只写进程内 `rememberToolCapability`，不落 `config.json`（方案 §4 #133）。
- 非流式 400 重发：兼容参数（含 reasoning）每次请求最多再发一次，不链式叠加，总量 ≤2 次 HTTP（方案 §4 #139）。

## 7. 验收

- Windows smoke **346/346**；新增用例覆盖 degraded 会话、幂等 close、审批决策帧、probe 错误归因、incomplete error 事件、terminal latch、五种方言、`protocol_error` 熔断、只读 loop 终止（方案 §4 #123–#126）、围栏/行内示例、非流式 JSON、边界调用（方案 §4 #127–#130）、配对 400/native 结构判定/进程级能力缓存（方案 §4 #131–#133）、headless 不落盘/累计参数/非终块调用/usage 告警/汇总帧（方案 §4 #134–#138）与 400 重发上限/doctor 重复计数/summary 请求数/方言比例与稳定码（方案 §4 #139–#142）。
- `typecheck` / `lint` / `build` / `verify:artifacts` 通过。
- Termux 真机与真实 provider 端到端仍待复跑。
