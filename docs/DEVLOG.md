# 开发日志（DEVLOG）

> 项目：fastcode-termux（`dateName/fastcode-termux`）
> 当前工作树：**0.1.8-beta.0**（基于 tag `v0.1.7` + 2026-11-09 修复；已本地 build/打包，未发布）；历史条目中的 0.1.6-beta 保持不变
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

## 0.1.8-beta.0（2026-11-09，未发布）

> `package/package.json` = `0.1.8-beta.0`；基于 tag `v0.1.7`（`be6e604`）+ 本节修复。已本地 build/打包，尚未发布；`release/` 已为 0.1.8-beta.0 资产，npm registry 最近查询仍为 0.1.6 / 0.1.6-beta。

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
- 发布：GitHub/npm 尚未发布；npm registry 仍为 0.1.6 / 0.1.6-beta。Termux 真机未复跑。
