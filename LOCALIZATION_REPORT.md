# FastCode-Termux 问题定位报告

> 基线：`dateName/fastcode-termux` @ `43c8835`（v0.1.6），源码 `package/src`。
> 本报告只做定位，逐条给出：现象、涉及文件、当前数据结构、根因、建议改动、风险、验收。
> 结论基于实际源码阅读，不是按需求文档推测。

---

## P0-1 文件工具路径逃逸 / sharedDirs

**现象**：文件读写可能越出工作目录；配置里没有 `sharedDirs`。

**涉及文件**
- `package/src/agent/tools.ts`
  - `sandboxPath()` L282-L299：`resolve` + `realpath` 包含性校验（已存在）
  - `allowedRoots()` L249-L266：仅读取 `FASTCODE_ALLOW_PATHS`；Termux 默认放行 `~/storage/shared`
  - `applyPatch()` L336-L377：**直接 `resolve(cwd, relative)`，未经过 `sandboxPath`**
- `package/src/config/store.ts`：`DEFAULT_CONFIG`
- `package/src/config/paths.ts`：`~/.fastcode/`

**当前数据结构**
```ts
DEFAULT_CONFIG = { providerId, model, theme, agentMode, systemPrompt,
                   enabledSkills, enabledPlugins, skillsRegistry, lifetimeCostUsd }
```
无 `sharedDirs`。

**根因**
1. `apply_patch` 的文件名来自补丁文本，`*** Update File: ../../x` 会被 `resolve` 接受，绕过沙箱；这是真实逃逸点。
2. 额外可写目录只能靠环境变量配置，没有落盘到 `config.json`，重启/新终端后丢失。
3. `resolvePath` 之外的 `copy_file` / `move_path` 已走 `sandboxPath`，无问题。

**建议改动**
1. `DEFAULT_CONFIG.sharedDirs: string[] = []`；`allowedRoots(cwd, config.sharedDirs)` 合并 env + 配置。
2. `applyPatch` 内 `const file = sandboxPath(cwd, relative)`。
3. 错误信息统一为 `path outside sandbox: <raw>`，并补充测试。

**风险**：低。`sandboxPath` 已处理符号链接真实路径；新增配置需要读 `loadConfig()`，注意不要形成循环依赖（`store.ts` 不依赖 `tools.ts`，安全）。

**验收**：`read_file ../../etc/passwd`、`apply_patch` 指向 `../x`、软链接指向外部均被拒绝；`sharedDirs` 内正常读写。

---

## P0-2 auth.json 按模型存 key

**现象**：同 provider 切换模型需要重新输入 key。

**涉及文件**
- `package/src/config/store.ts` L33-L226：`AuthStore`、`scopeId()`、`resolveApiKey()`
- `package/src/commands/login.ts` / `app.ts` L399-L450（向导）
- `package/src/app.ts` L269-L281（发送前取 key）

**当前数据结构**
```ts
AuthStore = {
  version: 2,
  keys: { "provider::model": { provider, model, key, addedAt } },
  legacy: { provider: key }   // 旧 provider-only，只提示不复用
}
```

**根因**：设计上就是 model-scoped；`resolveApiKey(provider, model)` 精确匹配 `provider::model`，所以同 provider 不同模型必然 miss。

**建议改动**
1. `AuthStore.version = 3`，`keys` 改为 `{ [provider]: { provider, key, addedAt } }`。
2. `loadAuth()` 兼容读取 v1（provider 字符串）、v2（`provider::model`）；迁移规则：每个 provider 保留 `addedAt` 最新的一条，写入 v3；记录 `migratedFrom`/日志。
3. `resolveApiKey(providerId, _model, envVars)` 只按 provider 查；保留签名避免改 UI。
4. `saveAuth` 仍写 `version: 3`；旧文件读取后自动落盘迁移一次。

**风险**：同一 provider 多把不同 key 时只能保留一把（按最新）；需在迁移日志里明确提示。`/logout provider model` 语义要兼容，按 provider 删除。

**验收**：同一 provider 切 3 个模型只输一次 key；旧 v2 文件自动迁移；`/whoami` 显示 provider 级 key。

---

## P0-3 长等待 / 多次工具调用后对话截断

**现象**：多轮工具调用或等待 >2 分钟后停止/截断。

**涉及文件**
- `package/src/app.ts` L292-L348（agent loop）
- `package/src/lib/http.ts`（无超时/心跳）
- `package/src/agent/limits.ts`（工具输出 30k 字符上限）
- `package/src/providers/*`（`fetch` 只带 `signal`，无超时）

**根因**
1. **硬编码 8 轮**：`for (let turn = 0; turn < 8; turn += 1)`；到上限直接写 “Stopped after …”，没有“继续”机制。
2. **无请求/空闲超时**：`fetch` 只受 Esc 的 AbortSignal 控制；SSE 卡住会无限等待。
3. **流式提前结束未识别**：`streamSSE` 在 `reader.read()` done 时直接结束；若服务端断流且没有 `[DONE]`，上层把半截文本当成最终回答。
4. **无上下文压缩**：`workingHistory` 无限增长，工具输出（最多 30k 字符/次）原样进历史，接近上下文上限时 provider 报 400，被当作普通错误终止。
5. 工具输出上限是 30000 字符（`DEFAULT_TOOL_OUTPUT_LIMIT`），不是根因但会放大问题。

**建议改动**
1. 轮次上限配置化：`maxAgentTurns`（默认 24，env `FASTCODE_MAX_AGENT_TURNS`）。
2. 请求超时 + 重连：`requestTimeoutMs`（默认 180s）；无任何 chunk 超过 60s 视为 idle 超时；对“未产出任何文本”的网络错误重试 1 次（指数退避）。
3. 流结束检测：若未收到 `done` 事件，标记 `incomplete` 并在历史里保留（提示“连接中断，可输入继续”）。
4. 上下文压缩：新增 `agent/context.ts`，按字符估算 token；超过阈值（默认 120k）时：
   - 保留 system + 最近 6 条消息；
   - 中间工具结果压缩为首/尾各 20 行 + “已压缩”标记；
   - 插入一条 system 说明，避免静默丢上下文。
5. 达到轮次上限时保留历史并提示“输入 继续 接着做”，而不是丢弃。

**风险**：重试可能重复计费；只在“零输出”时重试。压缩是有损的，必须保留最近工具结果。

**验收**：10+ 次工具调用、单次等待 >2 分钟仍能收尾；断流后出现明确提示；超长历史自动压缩且关键文件内容仍在。

---

## P1-1 stable UI 下 spinner 卡住

**现象**：stable UI（Termux / `FASTCODE_STABLE_UI=1`）等待时 `⠋ Streaming…` 不转。

**涉及文件**
- `package/src/ui/Spinner.ts` L22-L32
- `package/src/lib/uiMode.ts`
- `package/src/ui/Prompt.ts`（stable 时 `showCursor: false`）
- `package/src/app.ts` L476（`stable={stableUi && !agentActivity}`）

**根因**：`Spinner` 在 `stable` 时直接 `return`，不启动定时器；帧固定 `⠋`，文案固定为 `label`。`app.ts` 在 `agentActivity` 存在时又把 stable 置 false，状态切换也不稳定。

**建议改动**
1. stable 也启动独立定时器，间隔 120ms（非 stable 保持 80ms）。
2. 文案按状态：`Thinking` / `Streaming` / `Waiting for tool`（`agentActivity` 时用工具名）。
3. 仅 `busy` 时渲染（已满足）；空闲停止。
4. 保持 `Prompt` 的 `showCursor: false` 不变，避免光标闪烁。

**风险**：stable 模式每秒 8 次重绘仍可能闪烁；120ms 是折中，可用 `FASTCODE_SPINNER_MS` 覆盖。

**验收**：`FASTCODE_STABLE_UI=1` 等待 30s，spinner 持续转动，文案在思考/返回/工具间正确切换。

---

## P1-2 工具递归读目录 token 过高

**现象**：分析项目时递归读取大量目录，token 消耗高。

**涉及文件**
- `package/src/agent/tools.ts`：`listFiles()` L138-L145、`grepFiles()` L146-L166、`walk()` L185-L239、`readFile/readMany` L16-L19/L130-L137
- `package/src/agent/limits.ts`

**根因**
1. `walk()` 只硬编码跳过 `node_modules`、`.git`、`dist`，没有用户忽略规则。
2. `list_files` 逐条输出所有文件，没有目录摘要/符号摘要。
3. `grep` 对每个文件 `readFile(..., 'utf8')` 全量读入，无大小上限（大文件/二进制会浪费内存与 token）。
4. `read_file` / `read_many` 无文件大小截断，直接整文件进上下文。

**建议改动**
1. 新增 `agent/ignore.ts`：读取项目根 `.fastcodeignore`（gitignore 风格）+ 默认忽略 `node_modules/.git/dist/build/.next/coverage/*.lock`、二进制扩展名。
2. `walk()` 与 `grepFiles()` 使用忽略规则；`grep` 先 `stat`，超过 `FASTCODE_GREP_MAX_BYTES`（默认 1MB）跳过并计数。
3. `list_files` 默认“摘要模式”：目录树 + 每目录文件数 + 代码文件符号签名（正则提取 `function/class/const ... =`，最多 N 个）。
4. `read_file` 超过 `FASTCODE_READ_MAX_BYTES`（默认 200KB）时截断并附加提示；`read_many` 总预算控制。
5. 保留 `maxDepth`、`maxVisited` 现有保护。

**风险**：符号提取是启发式，可能漏掉；摘要模式需保留 `detail: true` 全量回退。

**验收**：同一项目分析任务 token 明显下降；关键文件仍可按需读取；`.fastcodeignore` 生效。

---

## P2-1 /model 交互改造

**现象**：`/model` 只打印文本列表，必须手输完整 id；离线/在线没有区分。

**涉及文件**
- `package/src/commands/model.ts`
- `package/src/commands/provider.ts`
- `package/src/app.ts`（`useInput`、`pendingLogin` 状态机）
- `package/src/ui/Prompt.ts`

**当前数据结构**：`CommandResult = { message?, silent?, quit? }`，没有“打开选择器”这类交互返回值。

**根因**：命令层只返回字符串；没有可复用的 Ink 列表状态机；`listModels()` 的在线/离线结果没有元信息（失败时静默回退静态表）。

**建议改动**
1. `CommandResult` 增加 `picker?: PickerRequest`；`AppActions` 增加 `openPicker`。
2. 新增 `ui/Picker.ts`：编号列表 + `↑/↓` + 数字直选 + Enter 确认 + Esc 取消，`stable` 模式下不高频重绘。
3. `App` 增加 `pendingPicker` 状态，拦截 `useInput`；确认后调用 `picker.onSelect(value)`。
4. `/model`：本地配置 + `provider.listModels()` 合并去重；`listModels` 返回 `{ models, offline }`（新增可选 `listModelsMeta`，旧方法保持兼容）。
5. `/provider` 也可复用同一选择器。
6. `/effort` 复用 Picker（见 P2-2）。

**风险**：Ink 的 `useInput` 与 `TextInput` 同时监听会冲突；选择器打开时必须禁用 Prompt。

**验收**：联网显示远端+本地合并列表；离线显示本地并标注；方向键、数字键、Enter 均可选择。

---

## P2-2 思考强度 /effort

**现象**：模型请求层没有 reasoning/thinking 参数，状态栏也没有档位显示。

**涉及文件**
- `package/src/types.ts`：`ChatRequest` 无 reasoning 字段
- `package/src/providers/openaiCompatible.ts`：`buildBody()` 无 `reasoning_effort`
- `package/src/providers/anthropic.ts`：无 `thinking`
- `package/src/config/store.ts`：`DEFAULT_CONFIG` 无 `reasoningEffort`
- `package/src/commands/*`、`package/src/ui/StatusBar.ts`

**根因**：能力从未实现；`ChatRequest` 也没有承载字段，provider 无法透传。

**建议改动**
1. `ChatRequest.reasoningEffort?: "low"|"medium"|"high"|"max"`；`ChatRequest.thinkingBudgetTokens?: number`。
2. `DEFAULT_CONFIG.reasoningEffort = "auto"`（默认不发参数，保持现状）；可选 `low/medium/high/max`。
3. Provider 映射：
   - OpenAI 兼容（openai/groq/xai/openrouter/deepseek）：`reasoning_effort`，`max → high`（OpenAI 最高档）。
   - Anthropic：`thinking: { type: "enabled", budget_tokens }`，low 1024 / medium 4096 / high 8192 / max 16000；`max_tokens` 必须大于 budget。
   - Google/自定义/Ollama：暂不支持，忽略并提示。
4. 新增 `commands/effort.ts`：`/effort` 打开 Picker（low/medium/high/max/auto），选择后写配置并立即生效。
5. `StatusBar` 显示 `effort: high`（`auto` 不显示）。
6. 请求前校验模型能力：不支持时在首轮提示一次，不反复弹。

**风险**：部分模型收到未知参数会 400；`buildBody` 需保留“去掉未知参数重试”的既有逻辑，并在重试时丢弃 reasoning 参数。

**验收**：`/effort high` 后请求体出现对应参数（Anthropic 为 `thinking`）；状态栏显示档位；不支持模型有友好提示且请求不失败。

---

## 建议提交顺序

1. `fix(security): safe path resolution + sharedDirs`（含 apply_patch 漏洞）
2. `fix(auth): provider-scoped keys + migration`
3. `fix(agent): timeout retry + tool loop limit + context compaction`
4. `fix(ui): stable-mode spinner timer`
5. `perf(tools): fastcodeignore + directory summary`
6. `feat(model): interactive model picker + online merge`
7. `feat(effort): reasoning effort setting and /effort command`

每条改完：`npm run typecheck` → `npm run build` → `node ../scripts/smoke-test.mjs` → 给出 Termux 自测步骤。

---

## 实施状态（本次已落地）

> 构建：`npm run build` 通过；`node scripts/smoke-test.mjs` 31/31；新增 28 项行为校验全部通过。
> `package/dist/cli.js` 已重新打包（2.55 MB）。

| 编号 | 状态 | 关键改动 |
|---|---|---|
| P0-1 | ✅ | `DEFAULT_CONFIG.sharedDirs` + `allowedRoots()` 读取；`apply_patch` 改走 `sandboxPath()` |
| P0-2 | ✅ | auth v3 按 provider 存；v1/v2 自动迁移，保留 `auth.json.v2.bak` |
| P0-3 | ✅ | `runStream()` 空闲超时 + 安全重试；轮次上限 24（可配）；`compactHistory()` 压缩；断流提示“继续” |
| P1-1 | ✅ | stable 模式 120ms 独立定时器；Thinking/Streaming/Waiting for tool 三态 |
| P1-2 | ✅ | `.fastcodeignore`、默认忽略、`read_file` 200KB 上限、`grep` 1MB 跳过、目录摘要+符号 |
| P2-1 | ✅ | `/model`、`/provider` 选择器（↑/↓、1-9、Enter、Esc）；`probeProvider()` 标注离线 |
| P2-2 | ✅ | `/effort auto|low|medium|high|max`；OpenAI 系 `reasoning_effort`、OpenRouter `reasoning.effort`、Anthropic `thinking.budget_tokens`；状态栏显示档位 |

### 新增配置项（`~/.fastcode/config.json`）

```json
{
  "sharedDirs": [],
  "maxAgentTurns": 24,
  "requestIdleTimeoutMs": 60000,
  "contextBudgetChars": 400000,
  "reasoningEffort": "auto"
}
```

环境变量覆盖：`FASTCODE_READ_MAX_BYTES`、`FASTCODE_GREP_MAX_BYTES`、`FASTCODE_SPINNER_MS`。

### Termux 真机自测步骤

```bash
cd ~/fastcode && git pull && npm install && npm run build
# P0-1
fastcode   # 让 agent read ../../etc/passwd → 应报 path outside sandbox
# P0-2
/login deepseek deepseek-v4-pro <key>
/model deepseek-flash          # 不应再次索要 key
cat ~/.fastcode/auth.json      # version 3，keys 下按 provider
# P0-3
# 连续让它跑 10+ 次工具调用；或用 /agent 开 agent 模式分析大仓库
# P1-1
FASTCODE_STABLE_UI=1 fastcode  # 等待 30s，spinner 应持续转动
# P1-2
printf 'node_modules/\n*.log\n' > .fastcodeignore
# 让 agent list_files → 输出应为“目录摘要+符号”
# P2-1 / P2-2
/model        # 方向键/数字/回车
/effort high # 状态栏出现 effort:high
```

### 回滚

- 代码：`git revert <commit>` 或 `git checkout -- package/src package/dist scripts`
- 配置：删除新增字段即可；旧 `auth.json` 备份在 `~/.fastcode/auth.json.v2.bak`

