# 开发日志（DEVLOG）

> 项目：fastcode-termux（`dateName/fastcode-termux`）
> 当前开发线：**0.1.9-beta.2**（基于 0.1.8 + P4–P9 harness；已推送并发布 GitHub prerelease，npm 未发布；npm `latest` 仍为 0.1.8，`beta` 见 npm）；历史条目中的 0.1.6-beta / 0.1.8-beta.0 / 0.1.8-beta.1 / 0.1.8-beta.2 / 0.1.8-beta.3 / 0.1.8-beta.4 保持不变
> 基线提交：`43c8835`（0.1.6 交接基线）
> 本轮工程改造：`630eae3`、`0bedcb5`、`05f833d`、`1e746cc`（2026-10-23）
> 适用平台：Termux / Android、Linux、macOS、Windows

本文件记录**每一次可交接的改动**：为什么改、改了哪里、数据结构怎么变、怎么验证、怎么回滚。
新改动请追加到文末，不要覆盖历史条目。

---

## 0.1.6-beta（2026-10-18）

### 总览

| 编号 | 主题 | 类型 | 兼容性 |
|---|---|---|---|
| P0-1 | 沙箱路径逃逸 + `sharedDirs` | 安全修复 | 向后兼容，新增可选字段 |
| P0-2 | auth.json 改为 provider 级密钥 | 数据结构升级 | 自动迁移 v1/v2，保留备份 |
| P0-3 | 长对话/多轮工具的稳定性 | 健壮性 | 配置新增字段，有默认值 |
| P1-1 | stable UI 下 spinner 冻结 | UI 修复 | 行为修正，无配置变更 |
| P1-2 | 目录读取 token 过高 | 性能/成本 | `list_files` 默认变摘要，可 `detail:true` 回退 |
| P2-1 | `/model`、`/provider` 交互选择 | 新交互 | 旧的 `/model <id>` 仍可用 |
| P2-2 | 思考强度 `/effort` | 新功能 | 默认 `auto`，不改变旧请求 |
| — | 冒烟测试隔离与回归 | 测试 | 测试不再污染真实 `~/.fastcode` |

验证结果：

```
npm run build              # tsc + esbuild，dist/cli.js 2.55 MB
node scripts/smoke-test.mjs    # 31/31 PASS
28 项行为校验（临时脚本）      # ALL PASS
Ink 渲染冒烟（主界面 + Picker）# 正常
```

---

### P0-1 沙箱路径逃逸与 `sharedDirs`

**问题**
- 文件工具大部分走 `sandboxPath()`（`resolve` + `realpath` 真实路径校验），
  但 `apply_patch` 的 `*** Update File:` 指令直接 `resolve(cwd, relative)`，
  模型可用 `../` 把文件写到工作区外。
- 额外允许目录只能通过环境变量 `FASTCODE_ALLOW_PATHS` 临时提供，没有落盘配置。

**改动**
- `package/src/config/store.ts`
  - `DEFAULT_CONFIG.sharedDirs: string[] = []`
  - 相对路径按项目根解析，`~/` 按用户主目录展开。
- `package/src/agent/tools.ts`
  - `allowedRoots(cwd)` 合并：cwd + `FASTCODE_ALLOW_PATHS` + `config.sharedDirs`
    + Termux 默认 `~/storage/shared`。
  - 新增 `resolveSharedDir(cwd, entry)`。
  - `applyPatch()` 的每个目标文件改走 `sandboxPath(cwd, relative)`。

**数据结构**
```jsonc
// ~/.fastcode/config.json（新增，均可省略）
{
  "sharedDirs": ["/sdcard/fastcode", "~/shared/projects"]
}
```

**兼容性**：旧 config.json 不含该字段时等价于 `[]`；env 方式仍有效。

**验证**
- `read_file ../../../etc/passwd` → `path outside sandbox`
- `apply_patch` 指向 `../escape.txt` → 被拒绝且不落盘
- 未配置 `sharedDirs` 时写共享目录被拒；配置后读写正常

**风险/限制**
- `shell` 工具执行的是真实命令，不受文件工具沙箱限制（原设计）。
- `sharedDirs` 等于显式扩大可写范围，交接时需向用户说明。

**回滚**：删除 `sharedDirs` 字段即可恢复严格模式；代码层回滚 `tools.ts` 对应两处。

---

### P0-2 auth.json：从「provider + model」改为「provider」

**问题**
- v2 的键是 `"<provider>::<model>"`，同一服务商切换模型会再次索要 Key，
  与用户预期不符（Termux 上反复输 Key 尤其痛苦）。

**改动**
- `package/src/config/store.ts`
  - `AUTH_VERSION = 3`，`keys` 改为 `{ [provider]: { provider, model?, key, addedAt } }`。
  - `loadAuth()` 兼容读取：
    - v1：`"deepseek": "sk-..."`（provider 字符串）
    - v2：`"deepseek::model": { provider, model, key, addedAt }`
    - v2 `legacy` 字段
  - 迁移规则：同一 provider 多个旧条目时保留 `addedAt` **最新**的一条；
    没有时间戳时保留先读到的条目。
  - 首次迁移写盘前把原文件复制为 `auth.json.v2.bak`。
  - `resolveApiKey(provider, _model, env)` 只按 provider 命中，签名保持不变。
  - `setCredential/removeCredential` 按 provider 操作；`model` 仅作为来源展示字段。
- `package/src/commands/login.ts`、`logout.ts`、`whoami.ts`、`app.ts`
  - 文案改为 provider-wide；`/logout <provider>` 删除该 provider 的唯一 Key。
  - 向导仍保留「模型」步骤（只为记录来源，不改变作用域），避免大改 UI。

**数据结构**
```jsonc
// ~/.fastcode/auth.json（v3）
{
  "version": 3,
  "keys": {
    "deepseek": {
      "provider": "deepseek",
      "model": "deepseek-v4-pro",   // 仅记录来源
      "key": "sk-...",
      "addedAt": "2026-10-18T..."
    }
  }
}
```

**兼容性/迁移**
- 旧文件读取后自动迁移，**不需要手动操作**。
- 同一 provider 若存了多把不同 Key，只能保留最新一把；旧文件在
  `~/.fastcode/auth.json.v2.bak`，可人工取回。
- 迁移只执行一次（模块级 `migrationChecked`），失败（只读目录）时保留内存视图。

**验证**
- 构造 v2 文件（两个模型 + legacy）→ 读后 keys 每个 provider 一条，取最新；
- `/model` 切换模型不再要求 Key；
- `auth.json` 写入 version 3，备份存在。

**风险**：多 Key 场景是有损迁移；已通过备份与文档提示降低风险。

**回滚**：恢复 `auth.json.v2.bak` 为 `auth.json`，并回滚 `store.ts` 与相关命令文案。

---

### P0-3 长等待 / 多轮工具后的对话截断

**问题定位**
1. agent 循环硬编码 `8` 轮，达到上限直接写 “Stopped after …”，历史被丢弃。
2. provider 请求只有 Esc 的 `AbortSignal`，SSE 卡住会无限等待。
3. 流在服务端提前关闭时，上层把半截文本当成最终回答。
4. `workingHistory` 无限增长，工具输出最多 30k 字符/次，接近上下文上限时
   provider 返回 400，被当成普通错误终止。

**改动**
- 新增 `package/src/agent/stream.ts`
  - `runStream(provider, req, key, options)`：
    - 空闲超时 `requestIdleTimeoutMs`（默认 60s），每个 chunk 重置；
    - 仅在「本轮尚未产出任何文本」时重试 1 次（避免重复计费/重复输出）；
    - 识别 5xx/网络/超时错误；401/402/403/404 不重试；
    - 返回 `incomplete` 标记（未收到 `done` chunk）。
- 新增 `package/src/agent/context.ts`
  - `compactHistory(messages, { maxChars, keepRecent })`：
    - 超过 `contextBudgetChars`（默认 400k 字符 ≈ 100k token）时触发；
    - 保留第一条用户请求 + 最近 6 条消息；
    - 中间消息压缩：工具结果保留首尾各一段并标注“已压缩”；
    - 插入显式 `[context compacted …]` system 消息，绝不静默丢上下文。
- `package/src/app.ts`
  - 轮次上限改为 `config.maxAgentTurns`（默认 24）；
  - 每轮请求前压缩历史；
  - 断流时保留半截输出并提示「输入 继续」；
  - 达到轮次上限时保留历史并提示「输入 继续」，不再丢弃。
- `package/src/config/store.ts` 新增：
  - `maxAgentTurns: 24`
  - `requestIdleTimeoutMs: 60000`
  - `contextBudgetChars: 400000`

**验证**
- 模拟 10 段大历史：压缩触发、保留首条与最新消息、体积下降、含压缩标记；
- 模拟 200ms 无数据的流：空闲超时在 2s 内触发；
- 真实网络行为需在 Termux 上用长任务复核（见交接清单）。

**风险/限制**
- 压缩是有损的：只保证保留最近工具结果，早期细节需重新读文件。
- 重试只覆盖“零输出”失败；已经输出一半后断流不会自动重放。

**回滚**：删除新增配置字段即回到默认值；代码层回滚 `app.ts` 循环与两个新模块。

---

### P1-1 stable UI 下 spinner 冻结

**问题**：`ui/Spinner.ts` 在 `stable=true` 时直接 `return`，不启动定时器，
帧固定为 `⠋`、文案固定，长等待看起来像卡死。

**改动**
- `package/src/ui/Spinner.ts`
  - stable / 非 stable 都启动定时器：默认 120ms / 80ms；
  - 可用 `FASTCODE_SPINNER_MS` 覆盖（≥60）。
- `package/src/app.ts`
  - 新增 `streamPhase`：`thinking | streaming | tool`；
  - 文案：`Thinking…` / `Streaming…` / `Waiting for tool…`（工具执行时显示 `Coding: <tool>`）；
  - `stable` 不再因为 `agentActivity` 被临时关闭。

**验证**：`FASTCODE_STABLE_UI=1` 等待 30s，spinner 持续转动；非 stable 行为不变。

**风险**：stable 模式重绘频率从 0 提高到约 8 次/秒；若个别终端仍闪烁，
可用 `FASTCODE_SPINNER_MS=250` 降频。

**回滚**：恢复 `Spinner.ts` 的 stable 分支与 `app.ts` 的 label 逻辑。

---

### P1-2 目录/文件读取的 token 与内存占用

**问题**
- 只硬编码跳过 `node_modules`、`.git`、`dist`；
- `list_files` 逐条列出全部路径，没有摘要；
- `grep` 对每个文件整体 `readFile`，无大小上限；
- `read_file/read_many` 无截断，大文件直接进上下文。

**改动**
- 新增 `package/src/agent/ignore.ts`
  - 默认忽略：`node_modules/.git/.hg/.svn/dist/build/out/.next/.nuxt/.cache/coverage/__pycache__/.venv/venv/target/...`
  - `.fastcodeignore`（gitignore 风格）：`#` 注释、`/` 锚定、`**`、`?`、`!` 反选、目录尾斜杠。
  - 二进制扩展名识别。
- `package/src/agent/tools.ts`
  - `walk()` 使用 ignore；`grep` 跳过忽略项、>1MB 文件、二进制文件；
  - `read_file/read_many` 统一走 `readTextFile()`：
    - 默认 200KB 上限，超出截断并注明；
    - 前 8KB 含 NUL 视为二进制，返回占位说明；
  - `list_files` 默认目录摘要：目录文件/子目录数量 + 文件名 + 大小 + 代码文件前 8 个符号；
    `detail: true` 保持旧的全量路径列表。
- `package/src/agent/protocol.ts` 系统提示补充 `detail` 与读取上限。

**新增环境变量**
- `FASTCODE_READ_MAX_BYTES`（默认 200000）
- `FASTCODE_GREP_MAX_BYTES`（默认 1000000）

**验证**：`.fastcodeignore` 生效；摘要输出包含文件大小与符号；
`read_file` 超限带截断提示；`grep` 跳过超大文件。

**风险**：符号提取是正则启发式，可能漏掉动态定义；`detail:true` 可回退。

**回滚**：`list_files` 传 `detail:true` 即恢复旧行为；代码层回滚 `ignore.ts` 与 `tools.ts` 对应分支。

---

### P2-1 `/model`、`/provider` 交互选择

**问题**：`/model` 只打印文本，必须手输完整模型 id；离线/在线无区分。

**改动**
- `package/src/types.ts`
  - `PickerItem` / `PickerRequest`；`CommandResult.picker?`；
  - `AppActions.setReasoningEffort`；`AppStateSnapshot.reasoningEffort`。
- 新增 `package/src/ui/Picker.ts`（纯展示）
  - 10 行窗口、当前项高亮、`1-9` 编号、滚动范围提示。
- `package/src/app.ts`
  - `pendingPicker` 状态；打开时替换 Prompt，Esc 取消；
  - 键盘：`↑/↓`、`1-9` 直选、`Enter` 确认；
  - 命令返回 `{ picker }` 即弹出。
- `package/src/commands/model.ts`
  - 拉取 `provider.listModels()` 并按 id 去重；
  - `probeProvider()` 探测在线状态，离线时在标题/消息中标注；
  - 选择后立即 `setModel`。
- `package/src/commands/provider.ts`
  - 同样改为选择器；选择后设置 provider + 默认模型。
- `package/src/providers/index.ts`
  - 新增 `probeProvider(provider, key, timeout=4s)`（Anthropic 用 `x-api-key`，其余 Bearer）。

**验证**：列表、方向键、数字、Enter、Esc 均正常；离线时显示内置列表与 `(offline)`；
`/model <id>` 旧用法保留。

**风险**：`probeProvider` 会额外发一次 `/models` 请求（4s 上限），
离线/网络差时打开选择器最多多等 4s。

**回滚**：移除 `picker` 返回即回到文本列表；`/model <id>` 不受影响。

---

### P2-2 思考强度 `/effort`

**问题**：请求层完全没有 reasoning/thinking 字段，状态栏也没有档位。

**改动**
- `package/src/types.ts`
  - `ReasoningEffort = "auto" | "low" | "medium" | "high" | "max"`
  - `ChatRequest.reasoningEffort?`
  - `Provider.supportsReasoning?()`
- `package/src/config/store.ts`
  - `DEFAULT_CONFIG.reasoningEffort = "auto"`
- `package/src/app.ts`
  - 请求携带当前档位；状态栏显示。
- `package/src/commands/effort.ts`（新增）
  - `/effort` 打开选择器；`/effort high` 直接设置；
  - 不支持思考参数的 provider 会明确提示“将忽略”。
- Provider 映射：
  | Provider | 参数 | 说明 |
  |---|---|---|
  | OpenAI / DeepSeek / Groq / Mistral / xAI / Moonshot / 智谱 / Qwen | `reasoning_effort` | `max` → `high` |
  | OpenRouter | `reasoning: { effort }` | — |
  | Anthropic | `thinking: { type: "enabled", budget_tokens }` | low 1024 / medium 4096 / high 8192 / max 16000；自动抬高 `max_tokens`、移除 `temperature` |
  | Google / Ollama / Custom | 不发送 | 保存档位但提示忽略 |
- `package/src/providers/openaiCompatible.ts`
  - 400 且错误信息提到 reasoning/thinking/unsupported 时，去掉该参数重试一次；
  - 兼容方言重试逻辑保留。
- `package/src/ui/StatusBar.ts`
  - 非 `auto` 时显示 `effort:high`；compact 模式也显示。

**验证**
- 捕获请求体：OpenAI 兼容 `reasoning_effort=high`；OpenRouter `reasoning.effort`；
  Anthropic `thinking.budget_tokens=8192` 且 `max_tokens > budget`；
- 无 reasoning style 的 provider 不出现额外字段；
- `/effort` 选择器 5 档，选择后写入 config。

**风险**
- 个别模型对未知参数返回 400：已做“去参数重试”。
- Anthropic 扩展思考与自定义 temperature 不兼容：已自动移除 temperature。

**回滚**：`reasoningEffort: "auto"` 即完全不发送参数；删除 `/effort` 命令不影响其余功能。

---

### 测试与构建改动

- `scripts/smoke-test.mjs`
  - 在任何模块加载前设置 `FASTCODE_HOME` 临时目录。
    原因：`agent/tools.ts` 现在会 import `config/store.ts`，而 `config/paths.ts`
    在首次调用时就缓存根目录；旧测试在导入工具之后才设置 HOME，导致写入真实
    `~/.fastcode`。
  - 密钥用例改为 provider 级语义：
    - 同 provider 不同模型复用同一 Key；
    - legacy provider-only 键迁移后可用。
- 构建产物：`package/dist/**` 与 `dist/cli.js` 已重新生成并提交。
  仍然遵守「只改 src，dist 由构建生成」。

---

## 构建 / 验证 / 交接命令

```bash
cd package
npm install            # 首次或依赖变更后
npm run typecheck      # tsc --noEmit
npm run build          # tsc + esbuild -> dist/cli.js
cd ..
node scripts/smoke-test.mjs

node package/dist/cli.js --version
node package/dist/cli.js doctor
```

Termux 真机自测（摘要，完整版见 `LOCALIZATION_REPORT.md`）：

```bash
cd ~/fastcode && git pull && npm install && npm run build

# P0-1
# 让 agent read ../../etc/passwd -> 应拒绝
# P0-2
/login deepseek deepseek-v4-pro <key>
/model deepseek-flash      # 不再索要 key
cat ~/.fastcode/auth.json  # version 3
# P0-3
# 连续 10+ 次工具调用；断网 2 分钟后再恢复
# P1-1
FASTCODE_STABLE_UI=1 fastcode   # spinner 持续转动
# P1-2
printf 'node_modules/\n*.log\n' > .fastcodeignore
# P2-1 / P2-2
/model
/effort high
```

---

## 已知限制与技术债（交接必读）

1. **shell 不受文件沙箱约束**：`shell` 执行真实命令，`../`、绝对路径仍可读写；
   文件工具（read/write/patch/grep/...）才受 `sandboxPath()` 限制。
2. **上下文压缩是有损的**：早期工具结果只保留首尾；需要时可让模型重新读文件。
3. **auth 迁移有损**：同一 provider 多把 Key 只保留最新；依赖 `auth.json.v2.bak` 找回。
4. **`/model` 在线探测多一次请求**：离线/弱网时最多多等 4 秒。
5. **思考强度支持是启发式**：provider 能力用静态列表判断，未知模型可能返回 400，
   已有“去参数重试”兜底。
6. **`app.ts` / `tools.ts` 仍偏大**：后续建议拆分（loop / tool registry / sandbox）。
7. **`lockdown()` 失败仍静默**（AUDIT M-3 未解决）：`FASTCODE_HOME` 放在 FAT/exFAT
   时 `auth.json` 可能不是 0600，建议后续在 `doctor` 中告警。
8. **技能安装仍是供应链入口**（AUDIT M-4 未解决）：任意 URL 的 `SKILL.md` 会注入系统提示。
9. **版本号未正式 bump**：文档标记 0.1.6-beta，`package.json` 仍为 `0.1.6`。

## 下一步建议（按优先级）

1. 在 Termux 真机完成 P0-3 的长任务与断流验证，并补充会话恢复测试。
2. `lockdown()` 返回状态，`doctor` 对权限降级告警（AUDIT M-3）。
3. 技能安装增加来源确认/白名单（AUDIT M-4）。
4. 把 `app.ts` 的 agent loop 抽成 `agent/loop.ts`，`tools.ts` 拆分注册表与执行器。
5. 正式发布前：
   - 将 `package.json` 版本改为 `0.1.6-beta.1`（或按发布策略）；
   - 更新 `CHANGELOG.md` 与 `README*`；
   - 重新构建并核对 `dist/cli.js` 的 diff。

## 交接检查表

- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `node scripts/smoke-test.mjs` 31/31
- [x] 28 项行为校验通过（沙箱、迁移、压缩、参数、超时、选择器）
- [x] `dist/cli.js` 已重新生成并提交
- [ ] Termux 真机长任务 / 断流验证（下一手）
- [ ] 版本号与 CHANGELOG 正式更新（发布前）

---

## 2026-10-23 工程改造（0.1.6-beta）

本轮把单体 TUI 升级为可审计、可恢复的 agent harness。按阶段 0–8 落地：

| 阶段 | 内容 | 主要文件 |
|---|---|---|
| 0 | 无 React runner；预算/循环终止；model-meta/estTokens | `agent/runner.ts`、`lib/model-meta.ts`、`guards.ts` |
| 1 | 工具 registry + 单文件工具；stateScope/revalidate；trust v1；approval 类型；进程树 kill | `agent/registry.ts`、`agent/tools/*`、`config/trust.ts`、`process-tree.ts` |
| 2a/2b/2c | SSE idle；checkpoint/未闭合/fsync；retryRequest/retryStream 前缀去重 | `lib/http.ts`、`lib/net.ts`、`session/log.ts` |
| 3 | 事实流 + projection/fingerprint + resume + 未配对 tool_call 补全 | `session/projection.ts` |
| 4 | 本地压缩（token/heap/server-aware）+ `/context` | `agent/compaction.ts`、`commands/context.ts` |
| 5 | patch parse/plan/apply、模糊匹配、CRLF/mode、符号链接、move 不覆盖、per-file diff | `patch/*`、`agent/tools/apply_patch.ts` |
| 6 | 后台 shell + 常驻池 + 增量轮询 + `/jobs` `/kill` | `agent/shell-session.ts` |
| 7 | 原生 tool_calls + 400 降级 + capabilities 缓存 | `protocol-mode.ts`、`tool-schemas.ts`、`lib/native-tools.ts` |
| 8 | `/cancel` `/steer` `/attach` `/compact` `/expand` `/edit` 等；折叠输出；doctor 扩展 | `commands/*`、`lib/diagnostics.ts` |

### 验证

- PC：`npm run typecheck` / `lint` / `build` 通过；smoke **115** 项。
- Termux（LG V409N / Android 12 / arm64 / Termux 0.118.2）：smoke **120/120**；
  kill -9 恢复、`/sdcard` fsync、进程组 kill、`/context`、真实 DeepSeek Flash 文本与工具轮次通过。
- 产物：`release/fastcode-portable-0.1.6-beta.tar.gz|zip`、`datename-fastcode-termux-0.1.6-beta.tgz`、`SHA256SUMS`。

### 已知限制（本轮新增）

1. **Ink 5.x IME 光标定位**：Termux pty 尺寸异常时 TUI 可能裁切/乱序（`abcdef` → `bcdefa`）；
   修正 pty（`stty cols/rows`）后基本输入通过。`showCursor` + `/edit` 为缓解，彻底修需 Ink ≥6.7 + `useCursor`。
2. **string-width 三版本**：4.2.3 / 5.1.2 / 7.2.0；未做强制 overrides（CJS/ESM 风险）。
3. **approval pending UI/resolver 未实现**：敏感/大 diff 仍 fail closed（零落盘）。
4. 原生 tools 仅覆盖 OpenAI 兼容 provider；Anthropic/Google/未知 provider 走伪协议。
5. Termux:API 通知未接；仅 doctor 提示 wake-lock/TMPDIR。
6. npm beta 已通过 GitHub Actions（Trusted Publishing/OIDC）发布；GitHub tag 已更新到最终代码。

### 回退

- 运行时：`FASTCODE_TOOL_PROTOCOL=legacy`（默认）、`FASTCODE_COMPACTION=0`、
  `FASTCODE_SESSION_LOG=0`、`FASTCODE_SSE_IDLE_MS` 调整。
- 安装：保留 `~/opt/fastcode-termux.old-*`；数据备份 `~/.fastcode.bak-*`。

---

## 0.1.7（2026-10-30 起始，2026-11-07 收口，已打 tag）

### 总览

- 版本/发布：`package.json` = `0.1.7`；tag `v0.1.7` 指向 `be6e604`；`release/` 已含 0.1.7 便携包 tar.gz/zip、npm tgz 与 `SHA256SUMS`。
- npm 状态：2026-11-09 查询 registry 仍返回 `latest=0.1.6`、`beta=0.1.6-beta`；npm 侧同步需再次核对，不能仅凭 tag 判定。
- 范围：Guardrails 三态与 AST 第二意见、审批 resolver、模型配置 TUI、会话 manifest、配置缓存、技能完整性；收口阶段追加守卫重建、egress 策略、工具契约与精准读写、provider 协议参数化、生命周期兜底与测试/基准脚本。
- 验证：PC `npm test` **275/275**（2026-11-09 复跑，HEAD `be6e604`）；Termux 真机 **281/281**（2026-11-06，G1 修复后）；`verify-artifacts` 通过。

### 关键改动

| 主题 | 改动 | 落点 |
|---|---|---|
| Guardrails | Hard Block / Soft Gate / allow 三态；`.env` 家族写入/删除/重命名/外发 hard；关键凭据读取 hard；`>>`/`>|`/fd 重定向解析；`sensitive_file_egress` | `agent/guards.ts`、`agent/shell-ast.ts` |
| AST | 纯 JS `bash-parser`，只升不降；`-c`/`find -exec`/`eval/source/.`/同段赋值 | `agent/shell-ast.ts` |
| 工具契约 | `read_file` offset/limit；`read_many` 总预算；`grep` case/glob/context/maxResults；`ToolResult` code/hint/截断/行字节/副作用；`replace_in_file` expectedMatches；copy 默认不覆盖；delete 递归需显式；move EXDEV 回退 | `agent/tools/*`、`agent/registry.ts` |
| Egress | 纯策略模块；默认 `enabled:false + mode:"audit"`；block 态 `EGRESS_DENY`；内容标记与扫描预算；不生成审批、不写 trusted；配置热生效；`off` kill switch | `agent/policy/egress.ts`、`registry.ts` |
| 事件/会话 | NDJSON `v/seq/ts`、tool_call/tool_result、usage/error.code；projection 保留 `notice`/`egress_denied`；旧 4 字段 fingerprint 兼容 | `headless.ts`、`session/projection.ts` |
| 审批 | pending request；once/session/always；catalogHash；trust --forget；tty/native/plain/json | `agent/approval*.ts`、`registry.ts`、`app.ts` |
| Provider | `providers/spec.ts` URL/query/pathParams/auth 模板；13 provider 默认快照不变；`modelsPath:null` 静态列表 | `providers/*` |
| 模型配置 | `/provider` `/model` `/login` 无参数统一向导；取消不改配置；key 掩码；DeepSeek 默认 `deepseek-flash` | `app.ts`、`commands/{provider,model,login}.ts` |
| 生命周期 | SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底；重试 `notice` 在 TUI/JSON/stderr 可见；`doctor --net` | `lib/lifecycle.ts`、`headless.ts`、`lib/diagnostics.ts` |
| 配置/技能 | stat 指纹缓存；技能目录 sha256；`/skills verify --confirm` | `config/store.ts`、`skills/manager.ts` |
| 构建/测试 | `build.mjs` 同源重建 src→dist→bundle；新增 `bench.mjs`、`verify-artifacts.mjs`；smoke 增至 275 项 | `scripts/*`、`package/scripts/*` |

### 关键不变量

- egress 判定在 `registry.execute()` 的 prepare 之后、approve 之前；Hard Block 不被 `FASTCODE_ALLOW_DANGEROUS`、trust、`sharedDirs`、`FASTCODE_TRUST_ALL` 覆盖。
- 默认 audit 不改变工具结果；只有 `enabled:true + mode:"block"` 才拦截；`mode:"off"` 为完整回退开关。
- block 拒绝返回结构化 `code:"EGRESS_DENY"`，不生成审批请求，不写 `trusted.json`。
- 旧 JSONL、旧 4 字段 projection fingerprint 与旧 config 仍可读取。

### 验证

```
cd package
npm test                          # ALL PASS (275 checks), 2026-11-09, HEAD be6e604
node scripts/verify-artifacts.mjs # 5 guard markers in cli.js + guards.js, bundle 2,138,499 B
```

- Termux 真机（LG V409N / Android 12 / arm64）：smoke **281/281**（2026-11-06；G1 修复前 279/279）。
- bench（Windows / Node v24.20.0）：cold start 143.74ms、write 200KB 8.86ms、read_many 10×200KB 26.04ms、list 1000 68.19ms、grep 1000 630.06ms。
- 真机已验证 TUI、审批 Esc/allow once、模型配置向导取消不改配置。

### 已知限制与未完成（0.1.7）

1. egress 未覆盖：provider 请求正文、session JSONL 落盘正文、CLI 子命令输出、skills/plugins prompt、TTS/share/clipboard、debug 日志；shell 路径仍是启发式。
2. 无 `/egress list|add|test` 命令；`doctor` 仅输出 egress 计数，无 `recentDenied`。
3. `HTTPS_PROXY` / `ALL_PROXY`（ProxyAgent）未接入，弱网代理场景仍可能卡到 SSE idle 超时。
4. Tier 3 备份前置未接入；native / json gate 端到端未完成。
5. 写路径未做 realpath/lstat 的 TOCTOU 复核；`grep` 复杂嵌套正则无执行超时/子进程隔离。
6. CI 仍只在 `v*` tag / 手动触发，未加 PR 门禁（typecheck/lint/smoke/产物一致性）。
7. `bench.mjs` / `verify-artifacts.mjs` 已入库但 `package.json` 未注册对应脚本；`npm test` 指向上级 `../scripts/smoke-test.mjs`，安装态/发布包不可用。
8. 运维入口：`doctor --json`、`sessions export/rm/prune`、TUI `/sessions`、子命令 `--json` 尚未补齐；现有 `sessions` / `sessions show` / `resume` / `doctor --net`。

### 回退

- 运行时：`FASTCODE_TOOL_PROTOCOL=legacy`、`FASTCODE_COMPACTION=0`、`FASTCODE_SESSION_LOG=0`、`egress.mode="off"`。
- 安装：保留 `~/opt/fastcode-termux.old-*` 与 `~/.fastcode.bak-*`。

---

## 0.1.8-beta.0（2026-11-09，npm beta 已发布）

> `package/package.json` = `0.1.8-beta.0`；基于 tag `v0.1.7`（`be6e604`）+ 本节修复。已本地 build/打包，并发布到 npm 的 `beta` tag；`release/` 已为 0.1.8-beta.0 资产，npm `beta=0.1.8-beta.0`、`latest` 仍为 0.1.6。

### 0.1.7 tag 之后的工作树修复

### TUI 状态栏 effort 重复

- 问题：终端列宽 < 88 的 compact 布局下，`ui/StatusBar.ts` 第一行渲染一次 `effort:<level>`，第二行又用 `${effort} · ...` 渲染一次，TUI 出现两个 `effort:high`。
- 修复：第一行的 effort 仅非 compact 时渲染（`!compact && effort`）；compact 继续只在第二行显示一次。
- 落点：`package/src/ui/StatusBar.ts`；`package/dist/ui/StatusBar.js` 与 `package/dist/cli.js` 由 `npm run build` 同源重建。
- 验证：`npm run typecheck` / `lint` / `build` 通过；`npm test` **275/275**；`node package/scripts/verify-artifacts.mjs` 通过（bundle 2,138,503 B）。
- 平台边界：未在真实 Ink TTY 截图复验；按 compact / 非 compact 两个渲染分支静态核对。

### 常驻 shell 会话修复（config/fast_其他.txt）

- ① `close` 兜底：`shell exited (0)` 不再一律写 `failed`；退出码 0 记为 `done`，非 0 / 信号仍为 `failed`。
- ② 状态泄漏：每条命令包进子 shell `( ... )`；`export`、函数、`umask`、`set -e`、`exit` 不再跨命令保留。外层仍每命令显式重置 cwd。
- ③ spawn 预算：`exit`/`set -e` 只结束子 shell，不再杀死常驻 shell，因此不会连续消耗 `FASTCODE_MAX_SPAWN_PER_TURN` 导致后续命令级联失败。
- ④ 后台输出串台：命令含后台操作符（AST `async`）时，打印完成标记后回收该 resident，后台子进程与其 stdout 管道一并终止；无 job 时的残留输出直接丢弃，不再进入下一命令。
- ⑤ 并发：resident 池默认 2，`/threads <1-6>` 可调大至 6；resident 路径达到上限时新命令排队等待空闲 shell（受命令 timeout 约束），不再立即返回 `both pool shells are busy`；one-shot 路径不受此池限制。
- ⑥ 正则误判：`needsOneShot` 改为 `bash-parser` AST 判命令名与参数；`echo top` 不再被当成交互式 one-shot；`sudo vim` 等 wrapper 仍能识别。
- 落点：`package/src/agent/shell-session.ts`；`dist/agent/shell-session.js` 与 `dist/cli.js` 由 `npm run build` 同源重建。
- 回归：`scripts/smoke-test.mjs` 新增 POSIX 专属用例（状态隔离、10×`exit 0`、后台输出、池满排队、`echo top` 分类）。
- 验证：`typecheck` / `lint` / `build` 通过；Windows `npm test` **275/275**（POSIX 专属用例跳过）；`verify-artifacts` 通过。另用 msys `sh -s` 手工核对子 shell 的 `exit 0`、状态隔离与 `set -e` 语义。**Termux/POSIX 真机尚未复跑，新增用例计数待真机确认。**
- 行为变化：命令内的后台进程会在该命令完成时随 resident 回收而终止；需要长期后台请使用 shell 工具的 `backgroundAfterMs` session，而不是 `&`。

### 并发上限与 `/exit` 收口（2026-11-09）

- resident 池默认 **2**（安全默认），`/threads <1-6>` 可调大、上限 6；resident 路径满载时新命令排队，one-shot 路径不排队（见下方纠偏）。
- `/exit`（`/quit`、`/q`）：运行中第一次输入只提示“将停止当前 run、保留部分输出并保存”，5s 内第二次确认后 abort → `shutdownShellsAsync()` → 关闭 session → 退出。
- `Ctrl+C` 在 run 中第一次先取消当前 run 并保留部分输出，第二次才退出；`Esc` 同样取消并保留部分输出，提示输入 `继续`。双击 Ctrl+C 的最终路径仍是 `quitCleanly()`。
- 回归：`#54` 改为验证顺序命令复用；新增 POSIX 用例覆盖“默认 2”“`/threads` 上限 6”“6 个 resident 满载”“第 7 条排队”“shutdown 清理全部 resident”。
- 验证：`typecheck` / `lint` / `build` 通过；Windows `npm test` **275/275**（POSIX 专属用例跳过）；`verify-artifacts` 通过。Termux 真机待复跑。

### 退出保存口 / 安全停止 / 压缩承接位（2026-11-09）

- 保存口：`quitCleanly()` 先 abort 当前 run，最多等 1000ms 让 finally 落完最终 facts；随后关闭 session。
- 安全停止：新增 `shutdownShellsAsync(graceMs)`：SIGTERM → 等待 close → 对仍存活的 child 强制 SIGKILL；`/exit` 与双击 Ctrl+C 走该路径。
- 保存落盘：`session.close({reason})` 写 `session_end` + projection，并对 JSONL 与 projection 做 best-effort fsync（FUSE 失败不阻断退出）。
- 压缩承接：`session_end.compaction` 预留 `source` / `summaryRef` / `pending`，当前默认 `none/null/false`；JSONL 全量事实仍保留，供后续压缩/恢复使用。
- 验证：手工创建会话后 `close({reason:"exit"})`，末行确认为 `session_end reason=exit compaction{source:none,summaryRef:null,pending:false}` 且 projection 存在；Windows 手工 `shutdownShellsAsync` 3 个 one-shot 进程，pids 全部消失、耗时约 336ms。Windows `npm test` **275/275**；POSIX 真机待复跑。

### 纠偏：双路径与并发记账（2026-11-09）

对照 `config/sj.txt` 复核后，之前把 `shellPoolSize` / `/threads` 说成“全局并发上限”是不准确的。实际语义：

- **两条路径**：resident（POSIX 非交互）与 one-shot（Windows、交互/REPL 判定命令）。两者预算不共享。
- **resident**：默认 2，`/threads` 可调 1–6；满载排队；每条命令在子 shell 中，状态不泄漏。
- **one-shot**：由 `FASTCODE_MAX_SPAWN_PER_TURN` 限制（默认 8/轮，新建速率不是全局并发上限）；满额立即返回 `spawn limit reached`，不排队。
- **共用预算**：`FASTCODE_MAX_SPAWN_PER_TURN` 同时计入新建 resident 和 one-shot；fresh turn 里 2 resident + 6 one-shot = 8 次新建。
- **跨 turn**：resident 池保留；one-shot 预算重置；上一轮未结束的 one-shot 仍占并发。因此既有 2 resident + 本轮 8 one-shot 可达 10（`/threads 6` 时 14）；长期未结束的 one-shot 没有全局回收上限。
- **记账**：`active` = resident + one-shot 运行中 job；`pool/maxPool` 只算 resident。`doctor` 两者会不一致。
- **旧观察已失效**：`export ZZZ=42` 在 2026-11-09 子 shell 修复后不会泄漏到后续命令；`echo top` 也已不再因参数含 `top` 走 one-shot（AST 按命令名判定）。路径分叉仍存在，但影响的是并发记账/生命周期，不是命令间状态。
- **证据**：手工 one-shot 长命令返回 `{active:1,pool:0,maxPool:2,maxSpawnPerTurn:8}`；同一 turn 第 9 个 one-shot 立即返回 spawn limit；代码 `maySpawn` 同时被 `acquireResident` 与 `startOneShot` 调用。

本轮仅纠正文档理解，不改变上述执行路径的行为；若要“全局并发上限 + 统一排队”，需要另立改动。

### 审批 “Deny with feedback” 输入修复（2026-11-09）

- **问题**：`decisionForOption(feedback)` 直接把 `option.prompt`（“Why should this be denied?”）当成反馈，选择该选项后没有等待用户输入，模型收到的是提示语而不是原因。
- **修复**：TUI 选择 feedback 后切到文本等待模式（Prompt 占位符显示问题，Enter 提交、Esc 取消、空输入不提交）；plain 模式选择后继续等待第二行文本；JSON gate 的 feedback 选项要求 `input`；native 模式用 `termux-dialog text` 收集文本，不可用时回落 TUI。
- **失败关闭**：`decisionForOption(feedback)` 无输入时返回 `deny`（不再伪造反馈）；JSON 缺 `input` 返回错误并 deny。
- **落点**：`agent/approval.ts`、`app.ts`、`headless.ts`、`agent/approval-json.ts`、`agent/approval-native.ts`。
- **验证**：`typecheck` / `lint` / `build` 通过；用 `tsx` 直接跑源码核对 feedback 有/无输入的 decision 与 JSON gate 结果；smoke 中 feedback 用例通过（Windows 总计数 282）。

### 工具压缩流 / 投影恢复修复（2026-11-09）

- **手动压缩落事实**：`/compact` 现在返回 `compacted` 元数据，由 app 追加 `compacted` fact（含 `summaryRef`、token、dropped/keep）；resume 的 `applySummary` 能找到对应摘要，不再复活全量历史。
- **清空持久化**：`/clear` 返回 `cleared`，app 追加 `cleared` fact；`buildProjection` 只使用最后一次 `cleared` 之后的事实，旧历史不再在 resume 后回来。
- **摘要质量**：section 顺序改为 Notes → Outcomes → Files touched → Requests → Actions；条目超限追加 `(N more … not listed)`；文件名过滤 `summary-*`、`//`、反斜杠转义和伪扩展；新压缩会删除本会话旧 `summary-*.md`。
- **投影工具压缩**：投影前把 native `role:"tool"` 与 legacy `FastCode executed…` 结果折叠为「tool + target + ok/error + 关键错误」事实，不保留完整 output；单条上限 8000 字符（保留头尾），总上限约 200KB；裁剪插入 `[projection] N earlier message(s) dropped …`，并保护 summary/compaction marker。
- **fingerprint 稳定性**：`sessionMetaFromFacts` 只采用首个 `session_start`，忽略 resume 追加的新 start，避免换目录/模型后必然全量重建。
- **配置可观测**：`/context` 改用 `compactionConfigFromEnv()`；新增 `FASTCODE_COMPACTION_RATIO` / `FASTCODE_COMPACTION_KEEP_TURNS` / `FASTCODE_COMPACTION_SUMMARY_TOKENS`，`doctor` 显示 keep/summary 预算。
- **版权**：根 `LICENSE` 与 `package/LICENSE` 保留原始 `Copyright (c) 2026 SimpleLittleDev` + MIT 全文，补 FastCode-Termux 自有版权行、上游来源与修改说明；README / package README 增加 License 段。
- **文档**：README / README.zh / package README 补齐 CLI 子命令、TUI 斜杠命令与设置入口；`docs/CONFIGURATION.md` §8 为完整速查（含 `/threads`、`/steer`、trust/skills/sessions/doctor/update）。
- **验证**：`typecheck` / `lint` / `build` 通过；`tsx` 源码核对：`/compact` 返回 `compacted+summaryRef`、摘要顺序、cleared 重置、工具载荷折叠、summary 文件安全删除、meta 取首个 start；smoke 对应用例通过。

### 0.1.8-beta.0 最终验证（2026-11-09）

- Windows：`npm test` **282/282**；`verify-artifacts` 通过（`dist/cli.js` + `dist/agent/guards.js` 5 个标记，bundle 2,150,507 B）。
- 打包：`release/` 已生成 `fastcode-portable-0.1.8-beta.0.tar.gz|zip`、`datename-fastcode-termux-0.1.8-beta.0.tgz`、`SHA256SUMS`。
- 发布：npm 已发布 `beta=0.1.8-beta.0`（`latest` 仍为 0.1.6）；GitHub tag/main 已推送，但 GitHub Release 二进制资产因 Actions billing 锁定待补。Termux 真机未复跑。

---

## 审计修复（2026-11-15，已随当前版本发布）

### 背景

`yq.txt` 把多轮审计收敛为 A–D 四条缺陷线：A 工具输出限界失效 → 压缩正则 O(n²) → 事件循环卡死；B 原生流式合并与外来方言静默吞掉；C 错误生命周期（配额误诊、悬空 tool_calls、旧文本落盘、QuotaError 死代码）；D provider/wire 边界。F/J/G/C/A/K/B/D/E/H 为同一轮 CLI/配置/会话层审计项。

### A 线：限界与压缩收敛

- `readFileRange` 改为先算 `budget = maxBytes - returnedBytes - 1`，对单行做 UTF-8 安全裁切后再 `push`；`readTextFileResult` 的整文件路径原本就有界。
- `limits.ts` 新增 `toolMessageLimit()` / `boundToolMessage()`；runner 在两处写 `role:"tool"` 前统一兜底（默认 1MB）。
- `compaction.ts`：摘要扫描采样 256KB；`collectFiles` 只扫前 64KB、正则 `{1,240}`；`clip` 的 `\s+` 限长；`afterTokens > beforeTokens * 0.9` 时把 >20KB 的 tool/user 内容瘦身到 8KB。
- `grep` 命中行裁剪 500 字符；shell job 保留窗口 1MB → 256KB。

### B 线：协议与失败显式化

- `protocol.ts`：`DSML_BLOCK_RE` 只消费含 `<invoke>` 的块；新增已知外来标记检测，0 调用且命中时返回 `errors`，runner 走既有 `protocol_error` 注入路径；`stripToolCalls` 保留外来块原文。
- `native-tools.ts`：`resolveIndex` 在无 `index` 时按 `delta.id`、未命名单条目或尾条目归并；对象型 `arguments` 序列化后累加。
- `openaiCompatible.ts`：`content-type: application/json` 且非 SSE 时直接解析完整 `choices[0].message` 的 text/tool_calls。
- `protocol-mode.ts`：`isNativeUnsupportedError` 改为 `400/422/501 + tool/function` 结构判定；仍由 runner 的 `fellBack` 保证只降级一次。

### C 线：错误生命周期与退出码

- `runner.ts`：每轮请求前 `pairToolMessages(history)`；native 批次提前 break 时对未执行 `tool_call_id` 补占位；`stream_error` 分支 `lastVisible = partial`（空则重置）。
- `app.ts` 配额提示收窄到 402/429 或 billing/quota/balance 类关键词，不再命中 `insufficient tool messages`。
- `net.ts`：`isQuotaError` 同步收窄；`retryStream` 失败尾部在配额错误时抛 `QuotaError`。
- `headless.ts`：plain 的 error 写 stderr，json 保留 error 事件；任一 error 或 `stopReason:"stream_error"` 时 `process.exitCode = 1`；补 `onProtocolFallback`/`onNativeOk` 并 `saveConfig`。
- `index.ts`：初始化错误默认只打印 message，`FASTCODE_DEBUG=1` 才打印堆栈。

### 配置 / 权限 / 诊断 / provider 边界

- `config/paths.ts`：`ensureDir` 在 POSIX 上 chmod 0700；`config/store.ts`：`saveConfig` 0600，`config.json` 解析失败保留 `.bak` 并提示一次；`session/log.ts` 以 0600 创建 JSONL。
- `stream.ts` / `http.ts` / `anthropic.ts` / `openaiCompatible.ts`：把 `requestIdleTimeoutMs` 传入 SSE 层，`doctor` 同时上报请求空闲与 SSE 回退。
- `custom.ts`：新增 `FASTCODE_AUTH_HEADER` / `FASTCODE_AUTH_PREFIX` / `FASTCODE_EXTRA_HEADERS`。
- `providers/index.ts`：`probeProvider` 先 `resolveBaseUrl` 再拼 `provider.modelsPath`；`modelsPath:null` 返回可达，避免 picker 恒 offline。
- `package.json`：注册 `verify:artifacts` / `bench`；`sessions show` 不存在 id、`trust --forget` 空值/不存在、非法 model ID 返回非零。

### 验证与回滚

- `npm run typecheck` / `lint` / `build` 通过；Windows `npm test` **ALL PASS (325 checks)**；`npm run verify:artifacts` 通过。
- 新增 smoke：单行超长读取、外来方言、无 index 归并、对象参数、压缩大消息、probe modelsPath、custom 认证头、grep 长行。
- 回滚：本轮未提交；`git checkout -- package/src package/dist scripts/smoke-test.mjs` 可回到 0.1.8-beta.0 工作树状态（保留发布准备的其他未提交改动）。
- 未做：Termux 真机复跑、方言解析器扩展、厂商端点联机验证、PR CI 门禁、`/egress` 命令、ProxyAgent。

---

## 执行后端抽象（2026-11-15，基础层，CLI 后端默认不注册）

### 目标与边界

现有 `Provider.stream()` 已经是 `AsyncIterable<ChatChunk>`，不假设 HTTP；问题在事件词汇太窄、折叠逻辑分散、以及外部 CLI 自执行工具会绕过治理链。本轮把「后端翻译」与「事件折叠」拆开，并固定一条边界：**外部 CLI 只能提议工具调用，所有执行回到 `runAgentTool → registry.execute`。**

### 落点

- `src/agent/stream-events.ts`（新增）：`StreamEvent` 闭集与 `StreamAssembler`。`usage` 在 `turn-end` 前；`turn-end` 后忽略；工具调用在结束时冻结；中断只保留文本/思考，不保留未完成工具调用；`reset()` 服务前缀安全重试。
- `src/agent/stream.ts`：`runStream` 改为只做 idle/retry/abort，文本/thinking/toolCalls/usage 全部由装配器产出；`RunStreamResult` 增加 `reasoning`。
- `src/types.ts`：`ChatChunk.reasoning?`；`Provider` 增加 `transport / capabilities / authKind` 声明式字段；`modelsPath` 继续用于无 `/models` 的后端。
- `src/agent/runner.ts` / `src/app.ts`：`assistant_raw` 可携带 `reasoning`，会话事实保留 thinking；可见回答不变。
- `src/lib/child-env.ts`（新增）：子进程环境 allowlist（默认 PATH/HOME/TMPDIR/locale/终端），未列入变量不继承；`redactSecrets()` 去 ANSI、`sk-…`、`Bearer …`、`api_key=…`。
- `src/lib/process-tree.ts`（新增）：进程组 SIGTERM → grace → SIGKILL；`agent/process-tree.ts` 保留兼容 re-export。
- `src/lib/values.ts`（新增）：`assertNever`。
- `src/providers/stdioBackend.ts`（新增）：`createStdioProvider()` 每轮 spawn 一个可执行文件，stdin 一行用户消息，stdout 读规范 NDJSON；工具只收集为 `toolCalls`，不在 provider 层执行；abort 先关读取侧再终止进程树；stderr 尾部脱敏。**不加入 `PROVIDERS`，无 UI/配置入口。**

### 规范 NDJSON

`text-delta / thinking-delta / tool-call / usage / done`；适配新 CLI 只需一个薄包装脚本，不在 FastCode 内为每个厂商写解析器。详见 `docs/EXECUTION_BACKENDS.md`。

### 错误返回落案补强

- **持续协议失败**：runner 统计 `protocolErrors`；`max_turns` 且存在协议失败时改记 `stopReason:"protocol_error"`，并 yield `error.kind="protocol_error"`；headless 退出码非 0。之前会落到 `max_turns` 且可能 0。
- **流提前结束**：`incomplete` 在 headless 也标记失败（保留部分文本），不再被脚本当成成功。
- **非幂等后端**：`Provider.capabilities.retryable === false` 时 `runStream` 不再重放；stdio 后端默认声明 false。
- **auth.json 损坏**：与 config 对称，保留 `auth.json.corrupt.bak`、stderr 提示一次、返回空凭据。
- 本轮后续已补：独立 approval 事实、headless `gate:decision`、probe 错误归因、session degraded/幂等 close、`incomplete` error 事件/terminal latch、五种方言。退出码映射见 `docs/ERROR_SEMANTICS.md`；`aborted` 130 按建议暂不做。

### 验证与回滚

- `typecheck` / `lint` / `build` 通过；Windows smoke **325/325**；`verify:artifacts` 通过。
- 新增回归：事件装配顺序/结束后忽略、thinking 保留、环境 allowlist、stderr 脱敏、规范 NDJSON 映射、工具只提议不执行、子进程不泄露未列入 secret、abort 及时收敛、protocol_error、incomplete、非幂等不重放。
- 回滚：未提交；`git checkout -- package/src package/dist scripts/smoke-test.mjs` 回到上一工作树状态。
- 未做：把 stdio provider 接入配置/命令/UI；会话续接 id；外部模型目录；只读 CLI 的首个端到端；Termux 真机。

---

## 失败语义与方言扩展（2026-11-15）

### 会话写失败（P0）

- `session.append` 写失败：stderr 提示一次、`degraded` 标志、返回 0；不走 `pushSystem`（避免递归写）。
- `close()` 在 degraded 或 `FASTCODE_SESSION_LOG=0` 时跳过 projection/fsync/prune；`close()` 幂等，重复调用只写一条 `session_end`。

### 审批事实与 headless 口径

- TUI：决策写 `approval` fact（`decision/scope/requestId/approvalKey` sha256 前 8 位）；`trusted.json` 仍是授权状态，不由 fact 推断。
- headless：无 session log，发 `gate:decision` 帧（含 decision/error），不落盘。

### 错误归因与终止态

- `probeProviderDetailed()` 返回 `{ok, reason, status}`；picker 显示“无 /models / HTTP 404 / 超时”，不再笼统 offline。
- `incomplete` 新增 `error.kind`；stdio 收到 `done` 后 terminal latch，忽略后续记录。
- `stopReason → exitCode` 映射文档化：`complete/max_turns=0`，`token_budget/cost_budget/loop_detected/aborted/stream_error/incomplete/protocol_error=1`；不统一 130。

### 五种文本方言

- Hermes/Qwen：`<tool_call>{"name":...,"arguments":{...}}</tool_call>`，arguments 直接是对象。
- Mistral：pre-v11 JSON 数组；v11+ `func[CALL_ID]{...}`，`{` 是参数起点；无结束标记。
- Kimi K2：section/call/argument 标记，函数名从 `functions.{name}:{idx}` 提取。
- Llama：`<|python_tag|>{...}` 与裸 JSON；`parameters` 归一为 `arguments`。
- `parseToolCalls` 返回 `detectedDialects`；检测到标记但 0 调用 → `protocol_error`；runner 也把非空 `detectedDialects` 视为失败，防止 B5 复发。

### 验证

- Windows smoke **325/325**；新增 degraded 会话、幂等 close、审批决策帧、probe 归因、incomplete error、terminal latch、五种方言与 `protocol_error` 回归。
- `typecheck` / `lint` / `build` / `verify:artifacts` 通过；Termux 与真实 provider 待复跑。

---

## 结构治理 L0–L2（2026-11-15，已随当前版本发布）

### L0：目录契约

- `docs/MODULES.md` 增加「目录契约」：新增/删除 `src/**/*.ts` 必须登记；每行写依赖方向；允许层级为入口 → 编排 → 领域 → 基础；新增跨层依赖必须说明理由。
- 标注两处已知受控上行：`config/store → agent/policy/defaults`（零依赖 defaults）与 `lib/diagnostics → 各层`（诊断探针）。
- 基线核对（当时）：本地 HEAD `70eaea9`（origin/main ahead 1）；yq 提到的 `4d2e1c3b` 本地不存在；工作树有未提交改动，**未执行 pull/sync**（后续已随发布同步）。

### L1：文档补漏（不动目录）

- `MODULES.md` 补 `src/lib/debug.ts`、`src/commands/threads.ts`、`src/ui/picker-window.ts`；新增同名/命名空间表。
- `docs/AUDIT.md` 标题改为「0.1.6-beta 起（当前工作树 0.1.8-beta.0）」；历史正文保留。
- `LOCALIZATION_REPORT.md` 增加说明：文件名沿用历史，实际是交接/验收报告。
- 新增仓库内 `CONTRIBUTING.md`，内联 AGENTS 的关键约束（clone 后可见）。
- `CONFIGURATION.md` 标注内部变量 `FASTCODE_SANDBOX` / `FASTCODE_SANDBOX_ROOT`。

### L2：死代码清理

- 删除 `src/agent/context.ts`（零引用）与 `src/config/store.ts` 的 `contextBudgetChars`、`RunOptions.contextBudgetChars`；旧配置中的该字段被忽略。
- 删除对应 `dist/agent/context.js` / `.d.ts`。
- 同名文件不批量改名；只在 MODULES 标注命名空间。

### 验证与回滚

- `typecheck` / `lint` / `build` / `smoke` / `verify:artifacts` 通过。
- 未做目录搬迁；回滚：`git checkout -- package/src package/dist docs scripts`，或按本批单 commit revert。

---

## 当前版本收尾（2026-11-17，已发布）

### 变更

- native 降级：`system` 尾部 native agent 段切回 legacy 文本协议段，保留调用方自带的前缀（#152）。
- 可见文本：`stripUnfencedText` 按当前正在 replace 的字符串计算 boundary offset，混排 `ANCHOR→D4→D5` 不再残留可见标记（#151）。
- 错误文案：OpenAI 兼容 provider 的 400 message 不再重复 `400 Bad Request:` 前缀（#150）。

### 验证与发布

- `typecheck` / `lint` / `build` / `verify:artifacts` 通过；Windows smoke **355/355**（Node 24，2026-11-17）。
- `release/` 三份归档 + `SHA256SUMS`；npm `beta` 与 GitHub Release 已发布；Release workflow #13 成功。
- Termux 真机与真实 provider 端到端仍待复跑。

### 回滚

- 按 bump / assets / fix 单 commit revert；代码回滚：`git checkout -- package/src package/dist scripts/smoke-test.mjs`。

---

## 安全修复：悬空链接与 resume（2026-11-21，工作树，未发布）

### 变更

- 新增 `src/lib/realpath.ts`：逐组件解析符号链接（含悬空链接），缺失尾部按词法拼接，循环/深度上限返回 undefined。
- `agent/tools/paths.ts`：`sandboxPath` 使用新解析；新增 `sandboxWritePath`、`assertNotSymlink`、`atomicWriteFile`、`tempSibling`/`commitTemp`。
- `write_file` / `append_file` / `copy_file`：写入解析后的真实目标，使用 `O_NOFOLLOW`；write/copy(overwrite)/replace 用同目录 tmp+rename 断开硬链接，append 拒绝 `nlink>1`。
- `agent/policy/egress.ts`：路径目标 `normalizeTarget` 走 `realpathOf`。
- `session/log.ts`：新增 `resolveResumeFile`（仅 sessions 下 id/`.jsonl`）；`projectionPath` 大小写不敏感。
- `session/projection.ts`：`writeProjection` 拒绝 `target === source`。
- `cli-main.ts`：`resume` 使用 `resolveResumeFile`，非法路径明确报错。

### 验证

- `scripts/smoke-test.mjs` 新增 B2-01/B2-01b/B2-02 用例；Windows **ALL PASS (369/369)**（最终文件 symlink 用例因 `EPERM` 跳过，悬空目录 junction 祖先与硬链接用例通过）。
- `typecheck` / `lint` / `build` / `verify:artifacts` 通过；Termux/POSIX 真机待复验。

### 回滚

- G-A1 与 G-A2 分开提交/回滚；代码回滚：`git checkout -- package/src package/dist scripts/smoke-test.mjs`。

---

## 协议/参数修复（2026-11-21，工作树，未发布）

### 变更

- `lib/values.ts`：新增 `parseJsonObjectWithRepair`（尾逗号/未闭合字符串/缺括号/单元素数组/已知数值布尔字符串）。
- `agent/runner.ts`：native 参数解析失败不再执行无参工具；连续协议错误在合法轮清零；`max_turns` 仅在最后一轮失败时改判；`protocol_error` 不再重复错误文案；`error` 事件带 `detail`。
- `agent/protocol.ts`：新增 `hasUnexecutedToolMarkup`（围栏外未执行标记检测）。
- `headless.ts`：JSON/plain 错误帧同步 `detail`。

### 验证

- 新增 1.3/B9/B10/B11/B12/B13 回归；Windows **ALL PASS (381/381)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

### 回滚

- 单 commit revert；代码回滚：`git checkout -- package/src package/dist scripts/smoke-test.mjs`。

---

## CI 门禁 B7（2026-11-21，工作树，未发布）

### 变更

- 新增 `.github/workflows/verify.yml`：push/PR、Node 24、`npm ci`、`npm run check`、`verify:artifacts`、`verify-gate` 自检、构建后 `git diff --exit-code -- package/dist`。
- 新增 `scripts/verify-gate.mjs`：检查 workflow 关键项、`dist` 运行时字面量；`--self-test` 删除临时副本中的字面量并断言门禁失败。
- `package.json` 注册 `npm run verify:gate`。

### 验证

- `npm run check`：ALL PASS (381/381) + typecheck/lint/build。
- `node scripts/verify-gate.mjs --self-test`：PASS。
- `dist/cli.js` 构建哈希稳定；提交后 CI 的 `dist` diff 应为空。

### 回滚

- 删除 workflow/脚本/脚本注册即可；单 commit revert。

---

## 统一事件流（2026-11-21，工作树，未发布）

### 变更

- 新增 `src/agent/event-stream.ts`：`EventStream` 统一 `v/seq/ts/session_id/turn` 信封；`serializeAgentEvent` 集中 AgentEvent→JSON 映射。
- `headless.ts` 改为只消费该序列化器；新增 reasoning 帧；gate 帧统一 `v:1`（入站兼容旧 `version`）。
- `approval-json.ts` 输出字段由 `version` 改为 `v`；`parseGateDecision` 兼容旧字段。

### 验证

- 新增 session_id/turn、reasoning、事件信封、gate v 断言；Windows **ALL PASS (385/385)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

### 回滚

- 单 commit revert；代码回滚：`git checkout -- package/src package/dist scripts/smoke-test.mjs`。

---

## 能力目录与结构化 diff（2026-11-21，工作树，未发布）

### 变更

- `lib/model-meta.ts`：`pricing`、`modelMetaSource`、`MODEL_META_UPDATED`、`estimateCostUsd`；已知 OpenAI/Anthropic 模型内置计价；用户覆盖支持 pricing。
- `providers/openaiCompatible.ts`：usage 按 staticModels/model-meta pricing 计算 `costUsd`。
- `lib/diagnostics.ts`：doctor 增加 `model price` 行（计价、来源、快照日期）。
- `lib/values.ts` + `write_file`/`replace_in_file`：`buildStructuredDiff` 与 oldText/newText/行号/行数/diffTruncated。
- `agent/event-stream.ts`：tool_result 增加结构化 diff 字段；`app.ts` 显示 diff 摘要。

### 验证

- 新增 pricing/source/override/costUsd、结构化 diff 断言；Windows **ALL PASS (390/390)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

### 回滚与后续批次（2026-11-21）

- 1.1：`revert` fact + `factsAfterRevert` + `/revert <n>`；消息级回滚，`--files` 未实现。
- 1.2：`session/instructions.ts` 指令发现；app/headless system 注入；`/context` 来源。
- 2.1：`agent/policy/permissions.ts` + guards Soft Gate 分层 allow/deny；未信任项目层忽略。
- 2.3：`agent/check-loop.ts` + `checkCommand/checkTimeoutMs`；写类工具后置检查。
- 验证：Windows **ALL PASS (404/404)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

### 外置扩展 / plan-todo / worktree（2026-11-21）

- 2.7：`plugin.json` manifest + capabilities/scope/version；默认关闭；prompt/skills 之外拒绝。
- 2.6：`session/plan.ts` + `/plan`/`/todo`/`/goal`；`[plan]` 投影保护。
- 3.3：`session/worktree.ts` + `/worktree` create/list/diff/apply/remove。
- 验证：Windows **ALL PASS (447/447)**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过。

### 回滚

- 单 commit revert；代码回滚：`git checkout -- package/src package/dist scripts/smoke-test.mjs`。

---

## B2 修复批次（2026-11-22）

- B2-04：真实 SSE 缺 `[DONE]`/`finish_reason`、Anthropic 缺 `message_stop` 抛 `IncompleteStreamError`；HTTP SSE 回归覆盖。
- B2-05：grep glob 与 `.fastcodeignore` 限制长度/`**`/文件大小/规则数。
- B2-06：`read_many.maxBytes` 钳制；单文件异常标 skipped 并继续。
- B2-09/10/12/13：i18n 类型安全；summaryRef 限 sessions 内且 ≤256KB；auth tmp/备份 0600；provider 错误正文脱敏。
- B2-11：进程组组长退出但组仍存活时继续 SIGKILL 升级（POSIX 回归）。
- B2-08/B2-14：短历史动态压缩、headless/prune 清理 summary、投影 arguments 截断与 200KB 硬上限；usage 告警去重、fallback caller 后缀、400 不再误重试。
- yq 维护：新增 `lib/atomic-file.ts` 原子写 seam；patch/apply 全 async；write/replace/copy/patch 共用 O_NOFOLLOW/回读/backup；fallback 成功标记 `atomic:false`；apply_patch 逐文件 `diffs`；post-write 收窄；glob 边界修复；worktree apply clean；revert/plan 进 `session/actions.ts`；doctor 报告残留 backup。
- B2-03：shell soft-gate 在 Hard Block 后、审批前检查 trust；未信任目录批准一次也不能执行。B2-07 精确化为“本地敏感读取允许、外传拦截”。
- yq 第二轮：permissions/grep regex 长度与嵌套量词防护；`**` 上限 4；read_many UTF-8 码点与预算一致；grep 行上限按字节；apply_patch SANDBOX_DENY；worktree recorded base + binary + `--commit` 增量 apply。
- 验证：Windows **ALL PASS (447/447)**（POSIX 448）；`typecheck`/`lint`/`build`/`verify:artifacts`/`verify:gate`/`version-anchors` 通过。


---

## B29–B45 收口（2026-11-26）

### 采集层 / 大文件 / diff

- B29：`createOutputBuffer` 增加 `fullValue()`；runner 从 `result.rawOutput` 落 raw；grep 透传 `rawText`/`droppedChars`。
- B30：raw 记录真实丢弃字符；facts/raw 出口统一 `redactSensitive`。
- B32：`write_file`/`append_file` 读取完整 before，不再用 16K 前缀计算 diff/审批。
- B31：DP 预算 250000 → 4,000,000；超预算先剥公共前后缀，再用唯一行锚点 + LIS 继续分 hunk。
- B37：DiffPreview 按完整 hunk 截断，不再从 hunk 中间硬切；省略时提示 `/expand <id>`。

### TUI / sessions / headless

- B39：保存最近 tool_result；`/expand <id>` 重放完整输出与 diff；编辑类工具输出在 stable UI 不折叠。
- B40：`/threads` 无参不弹 picker，显示当前值并预填 `/threads `；范围 1–128。
- B41：`sess`/`ls` 作为 `sessions` 别名，不再把 `sess` 当 prompt。
- B42：`sessions show` 打印用户/助手全文、tool_call 参数、tool_result 输出、compacted/checkpoint；支持 `--full`、`--max-chars`；追加 provenance 告警。
- B43：JSONL 被 prune 后可从 `.projection.json` 列出、show、resume。
- B44：列表按事实计数，带 cwd 与 `provider::model`；`--all`/`--limit`；projection-only 入列表。
- B45：headless 默认写 session log；`FASTCODE_HEADLESS_SESSION_LOG=0` 关闭；frame 与 log 共享 session_id。
- R1：`fastcode resume` 无 id 且有 TTY 时打开终端选择器（↑/↓、1–9、Enter、Esc）；`resume <id>`/`latest` 直连；非 TTY 回退最近一条。
- R2：命令文档/可用性审计；`/cost` 兼容空会话 totals；CLI `--help` 补 config export/import、sessions 参数、resume picker、skills `--force`；新增注册表/别名/`/help` 覆盖回归。
- R3：扩展中文 i18n 覆盖 banner、prompt、trust gate、picker 提示/页码、status bar、activity、help/about、footer；新增 zh catalog 全 key 回归。
- R4：清理英文界面残留中文（中断/取消提示、`[user interrupted]`、projection 说明、provider 标签、列表分隔符），新增 provider label 与中断提示无 CJK 回归。
- R5：新增 `scripts/security-test.mjs` 24 项安全攻击回归矩阵与 `docs/SECURITY_MATRIX.md`；覆盖路径/链接、shell、egress、session、审批、资源、权限；CI 在 check 后执行。

### 审批 / 诊断 / 中断

- B33：JSON UI deny 文案改为“无交互审批通道”。
- B34：`approval` fact 带 `source`；Requests/Notes/Actions/Outcomes 带 `[seq=N]`，Requests 上限 20。
- B35：raw 会话额度按字符统计。
- B36：`lockdown()` 返回布尔状态；doctor 打印 anchorChars。
- B38：未配对/中断 tool result 写结构化 `code:"INTERRUPTED"`/`doNotRetry:true`。

### 验证

- Windows smoke **501/501**；bundle **2,252,335 bytes**；`npm run check`、`verify:artifacts`、`verify:gate --self-test` 通过。
- 新增回归：P1 B30 fullValue、P2 B32 完整 before、P3-4/P3-5 多 hunk、P4 `/expand <id>`、P7 B38、B41/B43/B44/B45。
- 未完成：diff `n/p` 翻页、`/expand` `<Static>` 原位重渲染、POSIX/Termux 实跑、npm beta 回退。

### 回滚

- 按 P1–P7 分阶段改动；可整体回退到 main `0c2ab21`。未 commit、未 push。
