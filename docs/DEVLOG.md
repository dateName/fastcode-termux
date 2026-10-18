# 开发日志（DEVLOG）

> 项目：fastcode-termux（`dateName/fastcode-termux`）
> 当前版本标识：**0.1.6-beta（测试版）** — `package.json` 仍写 `0.1.6`，尚未打 tag / 发布 npm
> 基线提交：`43c8835`（0.1.6 交接基线）
> 本次改动提交：`0980f2e`（2026-10-18）
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
