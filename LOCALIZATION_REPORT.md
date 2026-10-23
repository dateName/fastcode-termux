# FastCode-Termux 0.1.6-beta 交接报告

> **版本标识**：0.1.6-beta（测试版）
> **基线**：`43c8835`（0.1.6）
> **本次提交**：`0980f2e`（2026-10-18）
> **源码**：`package/src`（69 个 TS 模块）
> **运行产物**：`package/dist/cli.js`（esbuild 自包含，已重新构建并提交）
> **状态**：P0 / P1 / P2 全部完成，构建与自动化测试通过；Termux 真机验证已补做。
>
> **历史快照说明**：本报告对应 `0980f2e`（2026-10-18）。之后的 0.1.6-beta harness 改造
> （runner/registry/投影/压缩/patch/shell/双轨协议/手机命令）见 `docs/ARCHITECTURE.md`、
> `docs/DEVLOG.md` 与 `CHANGELOG.md`。当前源码为 **114 个 TS 模块**，PC smoke 115、
> Termux smoke 120。

配套文档：

- `docs/DEVLOG.md` — 本次改动的逐项开发日志（数据结构、迁移、风险、回滚）
- `docs/ARCHITECTURE.md` — 架构与数据流
- `docs/CONFIGURATION.md` — 配置、密钥、环境变量
- `docs/MODULES.md` — 模块职责表
- `docs/AUDIT.md` — 安全审计

---

## 1. 结论摘要

| 编号 | 问题 | 状态 | 关键落点 |
|---|---|---|---|
| P0-1 | 文件工具路径逃逸；无 `sharedDirs` | ✅ 已修复 | `agent/tools.ts` `sandboxPath` / `applyPatch`；`config.sharedDirs` |
| P0-2 | Key 按 `provider::model` 存，换模型要重输 | ✅ 已修复 | `config/store.ts` auth v3 + v1/v2 迁移 |
| P0-3 | 长等待 / 多次工具调用后截断 | ✅ 已修复 | `agent/stream.ts`、`agent/context.ts`、`app.ts` |
| P1-1 | stable UI 下 spinner 冻结 | ✅ 已修复 | `ui/Spinner.ts` 120ms 定时器 + 三态文案 |
| P1-2 | 递归读目录 token 过高 | ✅ 已修复 | `agent/ignore.ts`、目录摘要、读取/搜索上限 |
| P2-1 | `/model` 只能手输 id | ✅ 已实现 | `ui/Picker.ts`、`commands/model.ts`、`commands/provider.ts` |
| P2-2 | 没有思考强度参数 | ✅ 已实现 | `/effort`、provider 参数映射、状态栏 |

验证证据：

```
npm run typecheck                 # 0 error
npm run build                     # dist/cli.js 2.55 MB
node scripts/smoke-test.mjs       # 31/31 PASS
28 项行为校验（沙箱/迁移/压缩/参数/超时/选择器）  # ALL PASS
Ink 渲染冒烟（主界面 + Picker）    # 正常
```

---

## 2. 项目速览（交接先看这里）

### 2.1 分层

```
bin/fastcode.mjs
  └─ dist/cli.js（esbuild 自包含；也是 CLI 入口）
       ├─ 非 TUI 子命令：provider/model/config/skills/doctor/...
       └─ TTY 下动态加载 dist/app.js（Ink + React）
            ├─ ui/                  Banner / Message / Prompt / Spinner / Picker / StatusBar
            ├─ commands/            21 个斜杠命令
            ├─ providers/           13 个服务商 + OpenAI 兼容共享层
            ├─ agent/               protocol / tools / guards / limits / stream / context / ignore
            ├─ config/              paths / store / trust / themes
            ├─ skills/ plugins/     技能与插件
            └─ session/ lib/        会话落盘、HTTP、平台、诊断
```

依赖方向：界面 → 领域 → 基础；`providers/` 被 cli、app、commands、diagnostics 共享。
**唯一事实来源是 `package/src`；`dist` 是构建产物，不要手改。**

### 2.2 一次 agent 请求（0.1.6-beta）

```
用户输入
  → app.ts handleSubmit
  → compactHistory()（超过 contextBudgetChars 时压缩中段）
  → runStream(provider, { messages, system, reasoningEffort })
       ├─ 空闲超时 requestIdleTimeoutMs（默认 60s）
       ├─ 零输出时重试 1 次
       └─ 返回 { text, usage, incomplete }
  → parseToolCalls() → runAgentTool()（沙箱 + 忽略规则 + 输出上限）
  → formatToolResults() 回填为 user 消息
  → 下一轮；maxAgentTurns（默认 24）后提示「输入 继续」
```

### 2.3 构建与自检

```bash
cd package
npm install
npm run typecheck
npm run build                 # tsc + esbuild
cd ..
node scripts/smoke-test.mjs
```

---

## 3. 逐项说明

### P0-1 沙箱路径逃逸与 `sharedDirs`

**根因**：`apply_patch()` 的目标路径直接 `resolve(cwd, relative)`，没有走
`sandboxPath()`，`*** Update File: ../x` 可越界；额外目录只能靠环境变量。

**改动**
- `DEFAULT_CONFIG.sharedDirs: string[]`：相对项目根，`~/` 展开到主目录。
- `allowedRoots()` = cwd + `FASTCODE_ALLOW_PATHS` + `sharedDirs` + Termux 默认共享存储。
- `applyPatch()` 每个目标文件改走 `sandboxPath()`（真实路径校验，防软链接）。

**验收**：`read_file ../../../etc/passwd`、`apply_patch ../escape.txt` 均被拒绝；
配置 `sharedDirs` 后共享目录读写正常。

**风险**：`shell` 命令仍可访问沙箱外（原设计，非文件工具）；`sharedDirs` 是显式扩权。

---

### P0-2 auth.json 改为 provider 级

**根因**：v2 作用域是 `<provider>::<model>`，`resolveApiKey()` 精确匹配，换模型必 miss。

**改动**
- `AUTH_VERSION = 3`，`keys[provider] = { provider, model?, key, addedAt }`。
- 读取时兼容 v1（provider 字符串）、v2（`provider::model`）与 `legacy`，自动迁移。
- 同一 provider 多条旧记录保留 `addedAt` 最新的一条。
- 迁移前备份为 `~/.fastcode/auth.json.v2.bak`。
- `/login`、`/logout`、`/whoami` 文案改为 provider-wide；`resolveApiKey` 签名不变。

**验收**：同一 provider 切 3 个模型只输一次 Key；旧文件自动变 v3；备份存在。

**风险**：同一 provider 多把不同 Key 时只保留最新一把（有备份）。
`model` 字段仅用于展示来源，不再参与匹配。

---

### P0-3 长对话 / 多轮工具稳定性

**根因**
1. 硬编码 8 轮，到上限直接停止并丢弃后续。
2. 请求无空闲超时，SSE 挂起会无限等待。
3. 断流未识别，半截文本被当成最终答案。
4. 历史无限增长，接近上下文上限时 provider 400 直接终止。

**改动**
- `agent/stream.ts`
  - `requestIdleTimeoutMs`（默认 60s），每个 chunk 重置；
  - 零输出时重试 1 次（401/402/403/404 不重试）；
  - 返回 `incomplete`，上层不再把断流当完成。
- `agent/context.ts`
  - 超过 `contextBudgetChars`（默认 400k 字符）时压缩中段；
  - 保留首条用户请求 + 最近 6 条；
  - 工具结果保留首尾并标注，插入 `[context compacted …]` 标记。
- `app.ts`
  - `maxAgentTurns` 默认 24；
  - 断流 / 到轮次上限都保留历史并提示「输入 继续」。

**验收**：10+ 次工具调用不中断；断流有明确提示；超长历史自动压缩且最近结果仍在。

**风险**：压缩有损；已输出一半后断流不会自动重放。

---

### P1-1 stable UI spinner

**根因**：`Spinner` 在 `stable=true` 时直接 `return`，不启动定时器。

**改动**：stable 模式改为 120ms 定时器（非 stable 80ms），
`FASTCODE_SPINNER_MS` 可覆盖；`app.ts` 增加
`thinking / streaming / tool` 三态文案。

**验收**：`FASTCODE_STABLE_UI=1` 等待 30s，spinner 持续转动。

**风险**：stable 模式重绘频率提高到约 8 次/秒；终端仍闪烁时可调大到 250ms。

---

### P1-2 目录读取 token 与内存

**根因**：只忽略 3 个目录；`list_files` 全量列出；`grep` 全量读文件；
`read_file` 不截断。

**改动**
- `agent/ignore.ts`：默认忽略依赖/构建目录；支持 `.fastcodeignore`
  （`#`、`/` 锚定、`**`、`?`、`!`、目录尾 `/`）；识别二进制扩展名。
- `list_files` 默认目录摘要（数量 + 文件名 + 大小 + 代码文件前 8 个符号），
  `detail: true` 恢复旧列表。
- `read_file/read_many` 默认 200KB 截断 + 二进制占位。
- `grep` 跳过忽略项、>1MB 文件、二进制文件。
- 新增 `FASTCODE_READ_MAX_BYTES`、`FASTCODE_GREP_MAX_BYTES`。

**验收**：同一项目分析 token 下降；`.fastcodeignore` 生效；关键文件仍可读。

**风险**：符号提取是正则启发式；`detail:true` 可回退。

---

### P2-1 `/model`、`/provider` 交互选择

**根因**：命令只返回字符串，没有可复用的选择器状态机；离线/在线无区分。

**改动**
- 新增 `ui/Picker.ts`（10 行窗口、当前项高亮、编号）。
- `app.ts` 新增 `pendingPicker`，拦截键盘：`↑/↓`、`1-9`、`Enter`、`Esc`。
- `CommandResult.picker` 让任意命令复用该选择器。
- `/model`：`listModels()` 去重 + `probeProvider()` 在线探测 + 离线标注。
- `/provider`：同样改为选择器，选择后设置 provider 与默认模型。
- 旧用法 `/model <id>`、`/provider <id>` 保留。

**验收**：方向键/数字/回车/Esc 均可用；离线显示内置列表；旧用法不回归。

**风险**：`probeProvider` 多一次请求（4s 上限），弱网时打开选择器最多多等 4s。

---

### P2-2 思考强度 `/effort`

**根因**：`ChatRequest` 没有 reasoning 字段，provider 无法透传，状态栏无档位。

**改动**
- `ReasoningEffort = auto | low | medium | high | max`；
  `DEFAULT_CONFIG.reasoningEffort = "auto"`（默认不发送，保持旧行为）。
- `/effort` 打开选择器；`/effort high` 直接设置；不支持时明确提示忽略。
- 参数映射：

| Provider | 参数 | 说明 |
|---|---|---|
| OpenAI / DeepSeek / Groq / Mistral / xAI / Moonshot / 智谱 / Qwen | `reasoning_effort` | `max` → `high` |
| OpenRouter | `reasoning: { effort }` | — |
| Anthropic | `thinking: { type: "enabled", budget_tokens }` | 1024 / 4096 / 8192 / 16000；自动抬高 `max_tokens`，移除 `temperature` |
| Google / Ollama / Custom | 不发送 | 保存档位但提示忽略 |

- `openaiCompatible.ts`：400 且提示 reasoning/unsupported 时去参数重试一次。
- `StatusBar`：非 `auto` 显示 `effort:high`（compact 模式也显示）。

**验收**：捕获请求体字段正确；Anthropic budget 与 max_tokens 关系正确；
`/effort` 五档可选；不支持模型不报错。

**风险**：能力判断是静态启发式，未知模型可能 400，已有重试兜底。

---

## 4. 数据结构与配置变更（升级对照）

### 4.1 `~/.fastcode/config.json`

```jsonc
{
  "sharedDirs": [],              // 新增：额外可读写目录
  "maxAgentTurns": 24,           // 新增：agent 工具轮次上限
  "requestIdleTimeoutMs": 60000, // 新增：流空闲超时
  "contextBudgetChars": 400000,  // 新增：历史压缩阈值
  "reasoningEffort": "auto"      // 新增：auto/low/medium/high/max
}
```

旧文件不需要改：`loadConfig()` 会与默认值合并。

### 4.2 `~/.fastcode/auth.json`

| 版本 | 结构 | 状态 |
|---|---|---|
| v1 | `{ "deepseek": "sk-..." }` | 读取并迁移 |
| v2 | `{ version: 2, keys: { "p::m": {...} }, legacy: {...} }` | 读取并迁移 |
| v3 | `{ version: 3, keys: { "p": { provider, model?, key, addedAt } } }` | 当前格式 |

迁移备份：`~/.fastcode/auth.json.v2.bak`。

### 4.3 新增环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `FASTCODE_READ_MAX_BYTES` | `read_file` 上限 | 200000 |
| `FASTCODE_GREP_MAX_BYTES` | `grep` 单文件上限 | 1000000 |
| `FASTCODE_SPINNER_MS` | spinner 帧间隔 | stable 120 / 普通 80 |

---

## 5. 测试与验证

### 5.1 自动化

```bash
cd package && npm run typecheck && npm run build
cd .. && node scripts/smoke-test.mjs        # 31/31
```

本次额外做的 28 项行为校验（临时脚本，未入库）：

- `read_file` 的 `..` 越界、`apply_patch` 的 `../` 越界；
- `sharedDirs` 未配置/已配置的读写差异；
- v2 → v3 迁移、最新时间戳优先、legacy 迁移、备份写入；
- 历史压缩触发、首条/最新保留、体积下降、压缩标记；
- OpenAI 兼容 `reasoning_effort`、OpenRouter `reasoning.effort`、
  Anthropic `thinking.budget_tokens`、无 reasoning style 时不发送；
- 流空闲超时触发时间；
- `/effort` 选择器数量与回写。

### 5.2 Termux 真机（下一手必做）

```bash
cd ~/fastcode && git pull && npm install && npm run build

# P0-1
# 让 agent read ../../etc/passwd -> 应报 path outside sandbox
# 在 config.json 加 sharedDirs: ["/sdcard/fastcode"]，再读写该目录

# P0-2
/login deepseek deepseek-v4-pro <key>
/model deepseek-flash          # 不应再次索要 key
cat ~/.fastcode/auth.json      # version 3

# P0-3
# 连续 10+ 次工具调用；中途断网 2 分钟再恢复；输入“继续”应能接上
# P1-1
FASTCODE_STABLE_UI=1 fastcode  # 等 30s，spinner 持续转动
# P1-2
printf 'node_modules/\n*.log\n' > .fastcodeignore
# 让 agent list_files -> 应输出目录摘要 + 符号
# P2-1 / P2-2
/model
/effort high                   # 状态栏出现 effort:high
```

---

## 6. 已知限制（交接必读）

1. **shell 不受文件沙箱限制**：`shell` 执行真实命令；只有文件工具走 `sandboxPath()`。
2. **压缩有损**：早期工具结果只保留首尾，必要时让模型重读文件。
3. **auth 迁移有损**：同一 provider 多把 Key 只保留最新，靠 `.v2.bak` 找回。
4. **`/model` 在线探测多一次请求**：弱网最多多等 4s。
5. **`app.ts` / `tools.ts` 仍偏大**：已在后续 harness 改造中拆出 `agent/runner.ts`、
   `agent/registry.ts` 与 `agent/tools/*`；`app.ts` 仍可继续拆 hooks。
6. **AUDIT M-3 未解决**：`lockdown()` 失败静默，`FASTCODE_HOME` 在 FAT/exFAT 时
   `auth.json` 可能不是 0600。
7. **AUDIT M-4 未解决**：任意 URL 的 `SKILL.md` 会注入系统提示，缺来源确认。
8. **版本号（历史）**：当时 `package.json` 仍为 `0.1.6`；后续已 bump 为 `0.1.6-beta`，
   已构建 tag/Release，npm 待 token。

---

## 7. 下一步建议

1. Termux 真机完成 P0-3 长任务、断流与「继续」恢复验证。
2. `lockdown()` 返回状态，`doctor` 对权限降级告警（M-3）。
3. 技能安装增加来源确认/域名白名单（M-4）。
4. 拆分 `app.ts` 的 agent loop 与 `tools.ts` 的工具注册表。
5. 正式发布前：版本号改为 `0.1.6-beta.1`（或按发布策略）、更新 `CHANGELOG.md`、
   重新构建并核对 `dist/cli.js` diff。

---

## 8. 交接检查表

- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过，`dist/cli.js` 已提交
- [x] `node scripts/smoke-test.mjs` 31/31
- [x] 28 项行为校验通过
- [x] 配置/密钥迁移有备份
- [x] 文档已更新（DEVLOG / ARCHITECTURE / CONFIGURATION / MODULES / AUDIT）
- [ ] Termux 真机长任务与断流验证
- [ ] 正式版本号与 CHANGELOG
