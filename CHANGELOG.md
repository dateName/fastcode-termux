# 更新日志（Changelog）

本文件记录每个版本的用户可见变化。逐项的技术修复明细见 [PATCHES.md](PATCHES.md)。

## 0.1.7

> 本版本重点：三态 Guardrails、egress 策略、AST 第二意见、审批闭环、模型配置 TUI、会话 manifest、配置缓存、技能完整性。

**FastCode 0.1.7 已从“单体 TUI”演进为：事件化 runner + 15 工具契约 + 三态 Guardrails + Egress 策略 + AST 第二意见 + 可审批/可回滚的 tool 执行 + 事实流/投影恢复 + 多 provider + Termux 单文件分发。**

### Guardrails
- Hard Block / Soft Gate / allow 三态；Hard Block 不受 `FASTCODE_ALLOW_DANGEROUS`、trust、session/always 影响。
- `.env` 家族写入/删除/重命名/外发为 Hard Block；普通敏感文件读取为 allow/Soft，关键凭据（`id_*`、`/etc/shadow`、`/etc/sudoers`）读取即 Hard Block。
- 敏感文件外传采用 basename + 路径段双黑名单：管道到网络 sink、上传参数、`scp`/`rsync`、`base64`/`tar` 间接外带、共享存储重定向均返回 `sensitive_file_egress`。
- 裸 `printenv`/`env` 为 Soft Gate，定向 grep/外发为 Hard Block。
- 纯 JS `bash-parser` AST 第二意见：只升不降，覆盖 `-c`、`find -exec`、`eval/source/.`、同段一次赋值。
- `nc -e`、`/dev/tcp`、非字面量 `eval/source/-c` 纳入 Hard Block。

### 工具契约与精准读写
- `read_file` 支持 `offset/limit`（1-based 行区间），返回 `totalLines/returnedLines/truncated`；超出 EOF 返回 `NOT_FOUND`。
- `read_many` 受 `FASTCODE_READ_MANY_MAX_BYTES` 总预算约束，返回 `filesRead/filesSkipped/returnedBytes`。
- `grep` 支持 `caseSensitive/glob/context/maxResults`；非法正则在 prepare 期返回 `INVALID_ARGS`，pattern 长度上限 1000。
- `ToolResult` 新增 `code/hint/truncated/totalLines/returnedLines/totalBytes/returnedBytes/filesRead/filesSkipped/matches`；registry 统一映射 `ENOENT/EEXIST/EISDIR/SANDBOX_DENY/APPROVAL_DENY` 等错误码。
- 写删移：`replace_in_file` 支持 `expectedMatches` 与计数回执；`copy_file` 默认拒绝已存在目标，`overwrite:true` 显式覆盖；`delete_file` 目录需 `recursive:true`；`move_path` 在 `EXDEV` 时回退 copy+remove；write/append/make_dir 区分 `created`/`touched`。
- headless NDJSON 增加 `v/seq/ts`、`tool_call`、`tool_result` 的 `output/side_effects/code/truncated` 与行/字节统计、`usage`、`error.code`。

### Egress 策略
- 新增纯策略模块 `agent/policy/egress.ts`，在 `registry.execute()` 的 prepare 后、approve 前判定；默认 `enabled:false + mode:"audit"`，只记录不拦截。
- `mode:"block"` 时敏感写入/删除/复制/移动、关键凭据读取、内容标记、超预算 outbound 输出返回 `code:"EGRESS_DENY"`；不生成审批请求，不写 `trusted.json`。
- 内置敏感 basename/路径、共享存储、内容标记不可由用户配置删除；`denyPaths`/`denyGlobs` 只能追加。`FASTCODE_ALLOW_DANGEROUS`、`FASTCODE_TRUST_ALL`、`sharedDirs` 不能覆盖。
- 工具输出在返回模型前扫描 `denyContentMarkers`；`maxScanBytes` 控制 outbound 扫描预算，超预算在 block 态 fail-closed。
- NDJSON/TUI/session 增加 `egress_denied` 事件；projection 将其保留为 system 消息；`doctor` 输出 egress 段。配置变更即时生效；`mode:"off"` 为完整 kill switch。

### 审批与交互
- Soft Gate 和大 patch 生成 pending；once/session/always、catalogHash 失效、`trust --forget`。
- TUI Picker / termux-dialog / plain 编号 / headless JSON 四种审批模式。
- Hard Block 不生成审批请求，也不显示 Allow/Always/Force。
- Tier 3 备份前置仍未接入（第三批），当前无默认 yes，破坏性动作 fail-closed。

### 模型配置 TUI
- `/provider`、`/model`、`/login` 无参数统一进入 provider → model → key 向导。
- 带参数快捷路径保留；支持方向键/数字/Enter、离线模型列表、手动 model ID、key 掩码、keyless provider 跳过 key。
- DeepSeek 默认模型改为 `deepseek-flash`；内置列表仍含 `deepseek-v4-pro` / `deepseek-flash`。
- Esc 取消不提交未完成配置。

### Provider 请求协议参数化
- 新增 `providers/spec.ts`：URL 模板、`pathParams`/`query`、auth 头纯函数；占位符缺失时抛错、不发请求。
- `openaiCompatible.ts` 的 `StreamOptions` 增加 `chatPath/modelsPath/query/pathParams/authHeaderName/authPrefix`；默认值与旧行为一致。
- 现有 13 个 provider 的请求 URL/header 快照不变；`modelsPath:null` 跳过在线列表；legacy `authHeader` 仍按前缀处理。

### 可靠性与会话
- `timeoutMs` 钳位与 debug 可见性；后台任务转后台保留超时，SIGTERM → grace → SIGKILL。
- 配置缓存使用 mtime/size/ctime 指纹；save/verify 失效。
- projection 保存 manifest（contentHash/sessionHash/lastFactSeq）；剪枝 → 回收 → 恢复保持工具配对。
- `lib/lifecycle.ts` 统一安装 SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底；headless 同时响应 SIGTERM/SIGHUP 中止。
- 流式重试通过 `notice` 事件可见（TUI + headless JSON；plain 写 stderr）；`doctor --net` 增加 registry 连通性结论。
- `/jobs` 显示会话年龄与 10 分钟回收提示；projection 保留 `notice` 与 `egress_denied` system 消息。
- 真机测试发现的 G1 已修复：`headless.ts` 的 json/plain 分支补 `notice` 映射（JSON 发 `{event:"notice"}`，plain 写 stderr）。
- 新增 `npm run bench`：冷启动、200KB 写入、10×200KB read_many、1000 文件 list/grep。
- 技能目录 sha256 完整性锁定；`/skills verify --confirm` 重新基线。
- 语法高亮裁剪常用语言，冷门语言纯文本回退 + 提示。

### 验证
- PC：typecheck/lint/build 通过，smoke 275/275（Windows，HEAD ddcdfc7 + 守卫重建 + 工具契约 + egress 策略 + 运维/兼容 + provider 协议 + G1）。
- 回滚演练：`git archive HEAD` 到临时目录后旧 `bin/fastcode.mjs --version` 正常启动。
- bench（Windows / Node v24.20.0）：cold start 143.74ms、write 200KB 8.86ms、read_many 10×200KB 26.04ms、list 1000 68.19ms、grep 1000 630.06ms。
- Termux 真机（本次，G1 修复后）：smoke **281/281**；G1 修复前为 279/279。历史 212/212 仅作 0.1.6-beta 记录。
- 真机已验证 TUI、审批 Esc/allow once、模型配置向导取消不改配置。

## 0.1.6-beta（测试版）

> 状态：`package.json` = `0.1.6-beta`；GitHub Release `v0.1.6-beta`（prerelease）
> 与 npm `@datename/fastcode-termux@0.1.6-beta`（dist-tag `beta`）已发布。
> 改动明细、迁移与回滚见 [docs/DEVLOG.md](docs/DEVLOG.md) 与 [LOCALIZATION_REPORT.md](LOCALIZATION_REPORT.md)。

### 工程改造（2026-10-23）
- **runner 拆分**：`agent/runner.ts` 纯 async generator；app 只消费事件。
- **工具契约**：registry + 15 个单文件工具；`stateScope`/`revalidate` 启动断言；trust v1。
- **恢复**：checkpoint、事实流、`projection.json`、resume 恢复 cwd/provider/model、未配对 tool_call 补全。
- **可靠性**：SSE idle、前缀去重重试、`QuotaError`、本地压缩（token/heap）、`/context`。
- **补丁**：parse→plan→apply、三级模糊匹配、CRLF/mode 保持、符号链接拒绝、per-file diff。
- **后台 shell**：2s 后返回 session、POSIX 常驻池、增量轮询、`/jobs` `/kill`。
- **双轨协议**：原生 tool_calls + 400 降级伪协议 + `capabilities.toolCalling`。
- **手机交互**：`/cancel` `/steer` `/attach` `/compact` `/expand` `/edit`，工具输出折叠，doctor 扩展。
- **测试**：PC smoke 115；Termux 120/120；真实 DeepSeek Flash 文本与工具轮次通过。

### 已知限制（0.1.6-beta）
- Ink 5.x IME 光标定位未根治；Termux pty 尺寸异常时会出现 `abcdef` → `bcdefa`/右侧裁切，
  修正 pty 后基本输入通过。`/edit` 可绕行，彻底修需 Ink ≥6.7。
- string-width 仍有 4.2.3 / 5.1.2 / 7.2.0 三份。
- approval pending UI/resolver 未实现（fail closed）。
- 原生 tools 仅覆盖 OpenAI 兼容 provider。

### 新增
- **思考强度 `/effort`**：`auto / low / medium / high / max`。OpenAI 兼容系发 `reasoning_effort`，OpenRouter 发 `reasoning.effort`，Anthropic 发 `thinking.budget_tokens`；不支持的服务商会明确提示忽略。状态栏显示当前档位。
- **交互式 `/model`、`/provider`**：方向键、数字直选、Enter 确认、Esc 取消；联网拉取与本地清单合并去重，离线时标注 `(offline)`。旧用法 `/model <id>` 保留。
- **`config.sharedDirs`**：在 `config.json` 中持久配置额外可读写目录（相对路径、`~/`、绝对路径）。
- **`.fastcodeignore`**：目录遍历与 grep 支持忽略规则；默认忽略 `node_modules`、`.git`、`dist`、`build` 等。
- **读取/搜索上限**：`read_file` 默认 200KB 截断；`grep` 跳过 >1MB 与二进制文件；`list_files` 默认输出目录摘要 + 符号，`detail:true` 可回退全量。

### 变更
- **auth.json v3**：Key 改为**按 provider 保存**，同一服务商切换模型不再重复输入。v1/v2 首次读取自动迁移，原文件备份为 `auth.json.v2.bak`。
- **agent 循环**：工具轮次上限 8 → 24（`maxAgentTurns`）；新增 60s 空闲超时（`requestIdleTimeoutMs`）与零输出重试；断流或到上限时保留历史并提示“输入 继续”。
- **上下文压缩**：超过 `contextBudgetChars`（默认 400k 字符）时压缩中段，保留首条请求与最近 6 条消息，并插入 `[context compacted]` 标记。
- **stable UI**：spinner 不再冻结，改为 120ms 低频转动；文案区分思考中 / 返回中 / 等待工具。

### 修复
- **`apply_patch` 路径逃逸**：补丁目标未走沙箱校验，`*** Update File: ../x` 可越界写文件。已改为与其它文件工具一致的 `sandboxPath()`。
- **长对话截断**：硬编码 8 轮、无超时、断流当完成、历史无压缩导致对话被截断。
- **smoke test 污染真实目录**：测试在模块加载后才设置 `FASTCODE_HOME`，会写入真实的 `~/.fastcode`；已改为启动前隔离。

### 验证
- `npm run typecheck`、`npm run build` 通过；`dist/cli.js` 2.55 MB。
- `node scripts/smoke-test.mjs` **31/31**；额外 28 项行为校验通过（沙箱逃逸、迁移、压缩、推理参数、空闲超时、选择器）。

### 已知限制
- `shell` 工具仍可执行真实命令并访问沙箱外路径（原设计）；文件工具才受沙箱限制。
- 同一 provider 多把不同旧 Key 时，迁移只保留 `addedAt` 最新的一把（有备份）。
- `lockdown()` 失败仍静默（审计 M-3）；技能安装仍缺来源确认（审计 M-4）。

## 0.1.6

发布时间口径：GitHub Release `v0.1.6`；npm 包 `@datename/fastcode-termux@0.1.6`（**首个发布到 npm 的版本**）。

> 说明：`0.1.5` 曾打过 GitHub tag，但那份是不完整的中途构建（缺少包名迁移、模型清单修复、DSML 支持等），也**未发布到 npm**。`0.1.6` 是这些改动的完整版本，并首次发布到 npm。

### ⚠️ 包名变更
- npm 包名由 `@simplelittledev/fastcode` 迁移为 **`@datename/fastcode-termux`**（发布到自有 scope）。
- 安装/卸载/更新命令随之更新；`README`、`docs/DEPLOYMENT.md`、`scripts/*`、`package/README.md` 同步。
- 历史致谢（原作者 SimpleLittleDev 与原 npm 链接）保留不变。

### 新增
- **API Key 作用域化**：Key 绑定到「服务商 + 模型」(`<provider>::<model>`)，只有当前 provider 与 model 同时匹配才使用；换模型不会误用别的 Key。旧 provider-only 键识别为 `legacy`，**不静默使用**，`doctor` 显示 `UNBOUND`。
- **引导式 `/login`**：服务商 → 模型 → Key（输入掩码）。保存后回显 服务商 / 模型 / Key 尾号（`sk-****abcd`）/ 文件路径。也支持一行式 `/login <provider> <model> <key>`。
- **发送前校验**：无可用 Key（或仅 legacy）时拦截并给出精确命令；服务商 401/403（鉴权）与 402/429（额度/限流）分开提示。
- **DSML 工具调用方言**：除 `<fastcode_tool>` 外，解析 DeepSeek 等模型的原生 `<｜DSML｜invoke …>` 标记（兼容 fullwidth/ASCII 竖线、重复/带空格、`calls`/`tool_calls`/`function_calls`、含不含外层块）。
- **实时模型列表为准**：`/models` 成功时只显示服务商当前返回的模型（已知的补标签/价格），离线/失败才回退内置清单。
- **Anthropic 实时模型列表**：`listModels` 先查 `/v1/models`，失败回退内置。
- **CI 自动发布 npm**：`.github/workflows/release.yml` 增加 `npm publish` 步骤（推 `v*` tag 或手动 Run workflow，需仓库 Secret `NPM_TOKEN`）。

### 变更
- 版本：`0.1.4` → **`0.1.6`**（`package.json`、`package-lock.json`、`README`、docs 全部对齐）。
- 安装口径：优先「克隆 + 软链自包含产物」或「便携包」；方式三改为明确的“从源码重建”路径；FAQ 说明 npm registry 可能滞后于仓库。
- 移除“上游仓库已删除”的措辞；删除香港大学（HKUDS）出处段落与相关说明。

### 修复
- **提示符光标前移**：`Prompt` 去掉 500ms 定时重绘（改为静态光标），避免首字符后光标偶发窜位。
- **下架模型长期残留**：`listModelsHttp` 不再把“内置里有、服务商已下架”的模型追加回去（例如 `deepseek-chat` 永不清除的问题）。
- **DeepSeek 内置/默认模型陈旧**：更新为 `deepseek-v4-pro` / `deepseek-flash`（以官方实时列表为准）。
- **DSML 工具调用不执行**：此前会被当普通文本显示，现能解析并真正执行。

### 分发
- `release/` 资产纳入版本库：`datename-fastcode-termux-0.1.6.tgz`、`fastcode-portable-0.1.6.tar.gz`、`SHA256SUMS`（`.gitignore` 只跟踪归档与校验和，忽略解压目录）。
- `release.yml`：Release 步骤仅在 `v*` tag 时执行；`npm publish` 步骤在 tag 或手动 Run workflow 且配置 `NPM_TOKEN` 时执行。

### 验证
- `npm run check` 全过（typecheck + lint + build + 冒烟，冒烟 **31 项**）。
- **真机实测**（LG V409N，Android 12，aarch64，Termux 0.118.2，node v26.4.0）：
  - 安装/`doctor`/`fastcode model` 正常；识别 Termux、stable UI；
  - 引导式 `/login`（服务商 → 模型 → 掩码输入）→ 保存回显 服务商/模型/`sk-****xxxx`/路径；
  - 作用域：精确命中 file、换模型回退出 env、无 env 则 `missing`（拦截）；
  - 实时模型列表只显示 `deepseek-flash`、`deepseek-v4-pro`；
  - 真实模型调用返回 `PONG`；DSML 解析自测通过。

### 涉及的主要文件
- `package/src/config/store.ts`、`src/commands/{login,logout,whoami}.ts`、`src/app.ts`、`src/ui/Prompt.ts`、`src/types.ts`
- `package/src/providers/{openaiCompatible,deepseek,anthropic}.ts`
- `package/src/agent/protocol.ts`
- `package/src/lib/{startup,diagnostics}.ts`、`src/cli.ts`
- `.github/workflows/release.yml`、`.gitignore`、`scripts/{smoke-test.mjs,build-portable.sh,update-termux.sh}`
- 文档：`README.md`、`README.zh.md`、`docs/{CONFIGURATION,DEPLOYMENT,ARCHITECTURE,MODULES}.md`、`PATCHES.md`、`package/README.md`

### 本版本提交
| Commit | 说明 |
|---|---|
| `ba65910` | Fix prompt caret jumping one column after the first keystroke |
| `4b1c040` | Docs: point users at the committed bundle, not npm; publish npm on tag |
| `208ed6e` | Scope API keys to provider + model, add guided /login, bump to 0.1.5 |
| `0ed90a7` | Rename the npm package to @datename/fastcode-termux |
| `a8b0d20` | Drop deleted-upstream wording and the HKUDS attribution |
| `1f19064` | Make the live /models list authoritative; refresh DeepSeek/Anthropic models |
| `bbb42c3` | Also parse DeepSeek's DSML tool-call dialect |
| `ea89317` | Add CHANGELOG.md summarizing the 0.1.5 changes |

### npm 发布过程与结论（0.1.6）

- 发布方式：CI 在 `v*` tag（或手动 Run workflow）时自动 `npm publish`；也可本地 `cd package && npm publish --access public`。
- 现象：全新包首次发布会先出现占位版本 **`0.0.0-stage`**，npm 提示
  `Your package is being processed and may take a few minutes to become available.`；
  几分钟后目标版本正式上线（`dist-tags.latest` 变为 `0.1.6`）。这是 npm 对全新包的正常处理窗口，**不是失败**。
- 校验：`npm view @datename/fastcode-termux version` → `0.1.6`。
- 凭据注意：
  - 能"免 OTP"的 token 才可用于无人值守 CI；而 npm 正在**收紧**这类 2FA-bypass token
    （通知：`npm tokens that bypass 2FA are being restricted ... for direct publishing`）。
  - **已改为优先 Trusted Publishing (OIDC)**：在 npm 包设置里关联本仓库 + `release.yml` 后，
    CI 无需长期 token；未配置 OIDC 时回退用仓库 Secret `NPM_TOKEN`。

> 更早的修复（0.1.3 → 0.1.4 及逆向重建源码树等）见 [PATCHES.md](PATCHES.md)。
