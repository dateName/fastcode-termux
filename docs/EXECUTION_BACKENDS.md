# 执行后端抽象（Execution Backends）

> 状态：2026-11-15。事件契约、单一装配器、环境白名单与 stdio 后端基础层已实现并通过回归；**CLI 后端默认不注册**，启用范围与首个后端形态待拍板（见 `OPEN_QUESTIONS.md` OQ-10）。
> 权威范围：本文件描述后端边界、事件契约与安全不变量；具体工具/守卫/审批语义仍以 `ARCHITECTURE.md`、`CONFIGURATION.md` 为准。

## 1. 为什么需要这一层

现有 `Provider.stream()` 的返回类型是 `AsyncIterable<ChatChunk>`，本身不假设 HTTP；但历史实现只覆盖 HTTP/SSE。把「另一个 agent CLI 当作模型后端」接进来时，真正的难点不是类型，而是三件事：

1. **事件词汇太窄**：只有 `delta / done / toolCalls? / usage?`，thinking、工具生命周期、错误和结束原因没有落点。
2. **折叠逻辑分散**：文本、usage、toolCalls 的累积写在 `runStream` 的循环里，换后端就要重写一遍。
3. **安全链容易旁路**：如果让外部 CLI 自己执行工具，`guards → registry → approval → sideEffects → facts → egress` 全部不触发。

本层把「把字节流翻译成规范事件」和「把规范事件折叠成一次响应」拆开，并明确一条不可让渡的边界。

## 2. 三层边界

```text
执行层（不变）
  runner.ts → registry.execute → guards / approval / sideEffects / facts / egress
        ↑ 只接受提议，不把执行权交出去
归一化层（本层）
  agent/stream-events.ts：StreamEvent 闭集 + StreamAssembler 单一折叠
        ↑ 仍是 AsyncIterable
后端层（纯 IO + 解析）
  providers/openaiCompatible.ts（HTTP/SSE）
  providers/stdioBackend.ts（spawn + 规范 NDJSON）
```

判定准则：

- 任何写文件、跑 shell、发网络请求的代码**不进**归一化层；
- 任何需要 `fetch` 或 `child_process` 的代码**不进**装配器；
- 后端只产出文本、thinking、工具调用提议、usage 和结束原因。

## 3. 规范事件（StreamEvent）

定义在 `package/src/agent/stream-events.ts`：

| 事件 | 含义 |
|---|---|
| `block-start` | 可选；为一个内容块预留索引 |
| `text-delta` | 可见回答增量 |
| `thinking-delta` | 思考/推理增量，永不混入可见回答 |
| `tool-call-delta` | 工具参数增量（为流式参数保留） |
| `tool-call-end` | 完整的工具调用提议（id/name/arguments） |
| `usage` | token/成本统计 |
| `turn-end` | 本轮结束原因：`stop / tool-calls / max-tokens / aborted / error` |

`ChatChunk` 保持向后兼容，只新增可选 `reasoning`；`chunkToStreamEvents()` 把旧 chunk 翻译成规范事件。新后端可以直接产出规范事件，旧 provider 无需改动。

## 4. 单一装配器

`StreamAssembler` 是唯一把增量折叠成最终响应的地方：

- `text` / `thinking` 分桶累积，互不污染；
- 工具调用按索引收集，`tool-call-end` 之后冻结，不再接受追加；
- `usage` 记录一次；
- `turn-end` 之后到达的记录被忽略（容忍畸形流）；
- 中断时只保留文本/思考，**不保留未完成的工具调用**（没有结果就不执行）；
- `reset()` 用于前缀安全重试时整体替换。

`runStream` 现在只负责 idle/retry/abort，语义折叠全部委托给装配器；`RunStreamResult.reasoning` 与 `AgentEvent.assistant_raw.reasoning` 把 thinking 保留到会话事实。

## 5. 子进程后端（stdio）

`providers/stdioBackend.ts` 提供 `createStdioProvider(config)`：

- 每轮 spawn 一个可执行文件（不经过 shell），stdin 写一行用户消息，stdout 逐行读规范 NDJSON；
- 环境变量来自**显式 allowlist**（`lib/child-env.ts`），默认只含 PATH/HOME/TMPDIR/语言/终端等必需项；未列入的 `FASTCODE_*`、`*_API_KEY`、代理 token 不会进入子进程；
- stderr 只保留末尾若干行，并在错误信息中经 `redactSecrets()` 去掉 ANSI、`sk-…`、`Bearer …`、`api_key=…` 等形状；
- abort 时先关闭读取侧、再按进程组 `SIGTERM → grace → SIGKILL` 终止，保证 1s 级收敛；
- 子进程退出但未发 `done` 时，以退出码 + 脱敏 stderr 尾部报错，而不是静默成功；
- **默认不注册**：它没有被加入 `PROVIDERS`，也没有 UI/配置入口。启用需要显式决策。

## 6. 规范 NDJSON 协议

stdout 每行一个 JSON 对象：

```json
{"type":"text-delta","text":"..."}
{"type":"thinking-delta","text":"..."}
{"type":"tool-call","id":"c1","name":"read_file","arguments":{"path":"a.txt"}}
{"type":"usage","inputTokens":1,"outputTokens":2}
{"type":"done"}
```

stdin 一行：

```json
{"type":"user","content":"...","system":"...","model":"..."}
```

非 JSON 行、调试噪声、未知 `type` 会被跳过；`error` 行会中止本轮并抛出错误。适配任意 CLI 时，只需写一个薄包装脚本把它的原生输出翻译成上述事件，**不需要在 FastCode 里为每个厂商写解析器**。

## 7. 安全不变量

1. **只提议，不执行**：外部 CLI 产出的 `tool-call` 只会进入 `runner` 的既有工具路径；永远不会在 provider 层直接执行。
2. **环境最小化**：只传 allowlist；需要额外变量时显式在 backend 配置里注入。
3. **凭据不外显**：stderr 尾部与错误信息必须脱敏；debug 日志不得回显 key。
4. **取消可收敛**：abort 后读取侧立即结束，进程树在 grace 内升级 SIGKILL。
5. **非幂等不自动重试**：CLI 后端不得沿用 HTTP 的 `retryStream` 默认重放；需要 resume/idempotency 的后端必须显式声明。
6. **单一真相源**：会话历史、工具结果、审批与副作用仍由宿主写入 JSONL/projection；CLI 自己的会话状态不得成为第三份真相。

## 8. 接入一个 CLI 后端（步骤）

1. 写一个薄包装脚本：把 CLI 的原生流（NDJSON/JSON-RPC/文本）翻译成 §6 的规范事件；工具调用只输出 `tool-call`，不要执行。
2. 用 `createStdioProvider({ id, label, command, args, envAllowlist, staticModels })` 创建 provider。
3. 通过显式配置把 provider 交给 runner（当前代码未注册到 `PROVIDERS`；接入 UI/config 属于下一步决策）。
4. 用 `runStream` 走一遍：文本/thinking/工具提议/usage/abort 五类事件都要在会话 facts 中可见。
5. 在 Termux 真机上验证：二进制可得性、进程组语义、包管理器/订阅登录方式。

## 9. 当前未做（待拍板）

- 是否把 stdio 后端注册为可选 provider，以及配置字段（bin/args/protocol/capabilities/认证方式/会话续接）。
- 首个验证后端：只读 CLI（只提议 read/search）还是完整 agent CLI。
- 是否允许外部 CLI 自执行工具（当前明确不允许）。
- 外部模型目录（在线模型目录 + 本地缓存）与窗口元数据。
- 会话续接 id 绑定、usage 缺失时的预算估算、子进程隔离目录。
