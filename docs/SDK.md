# FastCode SDK

> 状态：**v1 契约（草稿）**；当前工作树 `0.1.9-beta.2`，未发布。
> 范围：单任务、进程内、Node import。
> 本文件是 SDK 契约的**唯一定义处**；其他文档只链接本文，不复制字段。
> 验证基线（smoke / security / bundle）以仓库 `AGENTS.md` 为准，本文不重复计数。

## 1. 入口

```bash
npm install @datename/fastcode-termux
```

| 入口 | 内容 |
|---|---|
| `@datename/fastcode-termux` | `runTask` + 契约类型 |
| `@datename/fastcode-termux/types` | 仅类型 |

### 入口验证（可直接运行）

```bash
node -e "import('@datename/fastcode-termux').then(m=>console.log('runTask=' + typeof m.runTask))"
# 期望：runTask=function

node -e "import('@datename/fastcode-termux/types').then(()=>console.log('types=ok'))"
# 期望：types=ok
```

## 2. 契约（唯一定义）

### TaskStatus

```ts
type TaskStatus = "completed" | "failed" | "stopped";
```

### RunError

```ts
interface RunError {
    code: string;
    category: "auth" | "config" | "network" | "timeout"
        | "cancelled" | "agent" | "infrastructure" | "unknown";
    retryable: boolean;
    message: string;
}
```

### RunConfig

```ts
interface RunConfig {
    prompt: string;
    provider?: string;
    model?: string;
    cwd?: string;
    system?: string;
    maxTurns?: number;
    signal?: AbortSignal;
    taskId?: string;
}
```

### RunOptions

```ts
interface RunOptions {
    onEvent?: (event: AgentEvent) => void;   // 事件类型沿用现有 AgentEvent，不在此重定义
    onProgress?: (message: string) => void;
    onComplete?: (result: RunResult) => void;
    onError?: (error: RunError) => void;
    enableHooks?: boolean;   // runTask 读取；默认 false（CLI TUI/headless 用 FASTCODE_HOOKS，默认关）
}
```

### TaskHandle

```ts
interface TaskHandle {
    taskId: string;
    logPath: string;
    wait(): Promise<RunResult>;
    stop(): Promise<void>;
}
```

### RunResult

```ts
interface RunResult {
    taskId: string;
    status: TaskStatus;
    sessionId: string | null;
    logPath: string;
    durationMs: number;
    error: RunError | null;
}
```

## 3. runTask

```ts
runTask(config: RunConfig, options?: RunOptions): Promise<TaskHandle>
```

- **同步校验**：config 非法、provider 未知、缺少可用 Key 时同步 throw，不返回 handle。
- 返回 handle 时请求可能尚未开始；用 `handle.wait()` 取终态。
- **logPath 语义**：固定为 `<FASTCODE_HOME>/sessions/<id>.jsonl`，是会话事实流的权威位置；`logs/` 只放调试日志，`state/` 预留未启用。`FASTCODE_SESSION_LOG=0` 时仍返回该路径，但不要求文件存在。
- 单任务：一次调用对应一个 session。

### 最小示例

```ts
import { runTask } from "@datename/fastcode-termux";

const handle = await runTask({
    prompt: "summarize this repository",
    cwd: process.cwd(),
});
const result = await handle.wait();
console.log(result.status, result.sessionId, result.logPath);
```

### 可运行验证（临时脚本）

在仓库 `package/` 下保存为 `sdk-smoke.mjs`，执行 `node sdk-smoke.mjs`；期望输出 `ALL PASS`。

```js
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.FASTCODE_HOME = mkdtempSync(join(tmpdir(), "fastcode-sdk-"));
const { runTask } = await import("@datename/fastcode-termux");

function sseServer(text, status = 200) {
    return createServer((req, res) => {
        req.on("data", () => { });
        req.on("end", () => {
            res.writeHead(status, { "content-type": status === 200 ? "text/event-stream" : "application/json" });
            if (status !== 200) {
                res.end(JSON.stringify({ error: { message: text } }));
                return;
            }
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
        });
    });
}

async function start(server) {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.FASTCODE_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
    process.env.FASTCODE_MODEL = "mock";
}

// 1) config 非法：同步 throw
assert.throws(() => runTask({}), /prompt/);

// 2) 正常完成 + wait 幂等
const okServer = sseServer("hello");
await start(okServer);
const handle = await runTask({ prompt: "hi", provider: "custom", model: "mock", cwd: process.cwd() });
assert.equal(handle.wait(), handle.wait());
const result = await handle.wait();
assert.equal(result.status, "completed");
assert.equal(typeof result.sessionId, "string");
assert.ok(result.logPath);
await handle.stop();
okServer.close();

// 3) onError 与 wait 二选一：同一次失败
const failServer = sseServer("denied", 401);
await start(failServer);
let onError;
const failHandle = await runTask(
    { prompt: "fail", provider: "custom", model: "mock", cwd: process.cwd() },
    { onError: (error) => { onError = error; } },
);
const failResult = await failHandle.wait();
assert.equal(failResult.status, "failed");
assert.equal(onError, failResult.error);
failServer.close();

// 4) stop 幂等 + stop 后 wait=stopped
const slowServer = createServer((req, res) => { req.on("data", () => { }); req.on("end", () => { }); });
await start(slowServer);
const slowHandle = await runTask({ prompt: "slow", provider: "custom", model: "mock", cwd: process.cwd() });
await new Promise((resolve) => setTimeout(resolve, 20));
await slowHandle.stop();
await slowHandle.stop();
assert.equal((await slowHandle.wait()).status, "stopped");
slowServer.closeAllConnections?.();
slowServer.close();

console.log("ALL PASS");
```

### 边界：执行引擎 / 编排 / 消费者

- `src/agent/runner.ts` 的 `runAgent` 是执行引擎，不新增 mode 分支。
- `runTask` / `TaskHandle` 是编排/视图层，负责 session、事件 pump、wait/stop。
- CLI / TUI / headless 是消费者；未来新模式必须是配置或工作流定义，不能塞进 `runAgent` 分支。

## 4. 生命周期语义（写死）

| 场景 | 行为 |
|---|---|
| `stop()` 重复调用 | 幂等，不抛错 |
| `stop()` 后 `wait()` | resolve `status:"stopped"`，不 reject |
| `wait()` 多次调用 | 返回同一个 Promise |
| config 非法 | `runTask()` 同步 throw，不返回 handle |
| `onComplete` 之后 | 不再有 `onEvent` |
| `onError` 与 `wait()` | 二者只处理一个；推荐统一用 `wait()` |

## 5. AgentEvent 与 RunResult

- `onEvent` 收到现有 `AgentEvent` 闭集（`assistant_text` / `tool_call` / `tool_result` / `usage` / `notice` / `error` / `done` 等），用于流式消费。
- `RunResult` 是终态摘要；不要把两者混用。
- 传输层（headless `--ui json`）仍使用现有 `v:1` NDJSON 信封；SDK 不另造事件协议。

## 6. 已排除 API（本 SDK 不提供）

以下名称仅用于防止后续误提；它们不属于本 SDK 契约：

- `listTasks()` / `getTask()`
- `listSessions()` / `getSession()`
- `resume()` / `fork()`
- `provider` 能力发现接口
- approval handler 外部注入
- HTTP / tRPC / JSON-RPC / 跨语言传输
- `./runtime` 子路径
- `shadowVolumes`

## 7. 版本化

- SDK 契约 **v1**；只增不改；破坏性变更升 major。
- `EventStream` 的 `v:1` 是传输信封版本，与本 SDK 契约版本独立。
- 当前版本升级与 beta 规则后置决策；升级前以契约快照测试为准。
