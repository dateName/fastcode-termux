# 安全与健壮性审计报告 — 当前正式版（基于 beta.4；历史基线 0.1.6-beta 起）

审计对象：src/（114 个模块，由 dist 逆向重建后的源码）+ 构建脚本 + 部署方式。
审计方法：逐模块阅读、构造复现、用 scripts/smoke-test.mjs 固化为回归。

> 当前审计基线：见 `package/package.json`（2026-11-21 复核，结论与新增发现见第八节）；第一至七节保留历史快照。
> 历史快照：本审计对象为 0.1.6-beta。0.1.7 的 Guardrails/AST/审批/egress 与 0.1.8-beta.0 的 shell/退出/压缩/版权补充见 CHANGELOG 与 ARCHITECTURE §5–6（本文件第六节为 0.1.8-beta.0 补记）。
>
> 2026-11-16 补记：0.1.8-beta.1 后续批次（`9bd1ecc` 及 G-B/G-C）收窄方言触发面、native/伪协议互斥、ignore 旧 capabilities、headless 回收 shell、shell exitCode/`cwd` 显式化、stdio provider 环境注册；回归见方案 §4 #123–#149 与 `scripts/smoke-test.mjs`（当时 352 checks）。
> 2026-11-17 发布基线：当前版本已发布；PC smoke **355/355**；#150–#152 收尾见 CHANGELOG/PATCHES。
> 2026-11-21 工作树（未发布）：安全结论沿用 beta.2 复核；新增 shell permissions/check/worktree/plugin/plan 功能见 `CONFIGURATION.md` 与 §八；本轮未做全量安全重审。

## 级别定义

- 高：可导致密钥泄露、任意文件读写、越权执行
- 中：沙箱越界、拒绝服务、供应链风险、权限降级
- 低：健壮性、可维护性、体验

## 一、已修复

### H-1 沙箱可经软链接逃逸（高危，已修复）

- 位置：src/agent/tools.ts 的 sandboxPath()
- 问题：原实现只做词法检查（resolve + relative）。沙箱内一旦存在指向外部的软链接
  ——Termux 上 ~/storage/shared 默认就指向 /storage/emulated/0——
  read_file、write_file、append_file、delete_file、copy_file、move_path、stat_path
  全都能经它读写沙箱之外的文件。
- 复现：沙箱内 ln -s <外部目录> escape；然后 read_file escape/secret.txt。
  修复前可读到外部内容；write_file escape/evil.txt 可在沙箱外落盘。
- 影响：高。agent 模式默认开启，提示注入即可诱导模型读写任意路径。
- 修复：词法检查通过后，再解析“目标最深已存在祖先”的真实路径，
  与沙箱真实路径比对；不在其中即拒绝（路径含软链接越界）。
- 回归：smoke-test 新增用例——软链接越界读被拒、越界写被拒且外部无文件生成；
  同时确认沙箱内软链接仍可用、词法越界仍被拒。
- 设计权衡（0.1.6）：沙箱支持“允许根目录”。**Termux 上默认放行 ~/storage/shared**
  （手机项目/下载都在共享存储），可用 FASTCODE_ALLOW_SHARED_STORAGE=0 关闭，
  或用 FASTCODE_ALLOW_PATHS 增加根目录。判定以真实路径为准：
  指向 系统目录 等非允许位置的软链接（包括嵌套在共享存储内部的）仍被拒绝，
  已加入回归用例。

### M-1 悬空软链接拖垮 grep / list_files（中危，已修复）

- 位置：src/agent/tools.ts 的 walk()
- 问题：逐条 stat() 跟随软链接，悬空链接（Termux 清理存储后必然出现）抛 ENOENT，
  导致整次工具调用失败，一个坏链接拖垮全部结果。
- 修复：stat/readdir/visit 逐项容错；越出沙箱根的软链接只列出不深入；
  祖先链防环；5000 条遍历上限。

### M-2 API Key 明文回显（中危，已修复）

- 位置：src/app.ts 斜杠命令回显
- 问题：/login <provider> <key> 会把 Key 原样写进对话记录。
- 修复：对 login 参数打码为 ********。

### H-2 apply_patch 路径逃逸（高危，0.1.6-beta 已修复）

- 位置：src/agent/tools.ts 的 applyPatch()
- 问题：`*** Update File:` 的目标直接 `resolve(cwd, relative)`，没有经过
  `sandboxPath()`；模型可用 `../` 读写工作区外文件，绕过 H-1 的真实路径校验。
- 复现：`apply_patch` 指向 `../escape.txt`，修复前会在沙箱外写入。
- 修复：每个补丁目标改走 `sandboxPath()`；同时新增 `config.sharedDirs`
  作为显式的额外允许目录（相对项目根 / `~/` / 绝对路径）。
- 回归：smoke-test + 行为校验覆盖 `../` 拒绝、外部文件不落盘、
  sharedDirs 配置前后读写差异。

### L-3 无请求超时（低，0.1.6-beta 已修复）

- 位置：新增 src/agent/stream.ts，app.ts 改用它
- 修复：空闲超时 `requestIdleTimeoutMs`（默认 60s，每个 chunk 重置）；
  零输出时重试 1 次；识别未收到 done chunk 的断流。
- 回归：模拟 200ms 无数据流，2s 内触发超时。

### L-1 grep 无单文件大小上限（低，0.1.6-beta 已缓解）

- 位置：src/agent/tools/readers.ts 的 grepFiles()
- 修复：默认跳过 > `FASTCODE_GREP_MAX_BYTES`（1MB）的文件与二进制扩展名；
  `read_file` 支持 offset/limit 行区间，`read_many` 受 `FASTCODE_READ_MANY_MAX_BYTES` 总预算约束；
  `grep` 增加 pattern 长度上限（1000）、prepare 期正则编译与 `maxResults`；`walk()` 支持 `.fastcodeignore`。
- 仍未解决：复杂嵌套量词仍可能 ReDoS；未做正则执行超时或子进程隔离，建议后续补上。

### L-2 Egress 策略与出口覆盖（审计结论，2026-11-06）

- 位置：`src/agent/policy/egress.ts`，由 `registry.execute()` 在 prepare 后、approve 前调用。
- 已覆盖：工具路径读写/删/复制/移动/patch、工具 payload、shell command 内容标记、工具输出回模型前、NDJSON/TUI/session 事件。
- 不变量（0.1.6 时默认 audit；**0.1.8-beta.0 起默认 `enabled:true + mode:"block"`，见 DECISIONS D-21**）；block 态 `EGRESS_DENY` 不生成审批、不写 `trusted.json`；超预算 outbound fail-closed；`ALLOW_DANGEROUS`/`TRUST_ALL`/`sharedDirs` 不可覆盖。
- 未覆盖：provider 网络正文、session JSONL 落盘正文、CLI 子命令输出、skills/plugins prompt 注入、TTS/share/clipboard、debug 日志；shell 路径仍是启发式。
- 证据：Windows smoke 275/275、Termux 真机 281/281；真机 egress 套件 28/28、共享存储分层矩阵、`FAIL` 无产品级失败。详见 `ARCHITECTURE.md` §5.1。

## 二、待办（已定位，尚未修改）

### M-3 密钥文件在忽略权限的文件系统上静默降级（中危，待办）

- 位置：src/config/paths.ts 的 lockdown()
- 现状：chmod 失败被 catch 静默吞掉。若 FASTCODE_HOME 指向 /sdcard（FAT/exFAT），
  auth.json 可能对其它 App 可读。
- 建议：lockdown 返回成功与否；doctor 在失败时明确告警，或拒绝在该位置保存密钥。

### M-4 任意 URL 安装技能即供应链入口（中危，待办）

- 位置：src/skills/manager.ts 的 installSkill()
- 现状：支持 https 直链与 owner/repo，下载的 SKILL.md 会整体注入系统提示。
- 建议：安装前展示来源与正文摘要并要求确认，或限制白名单域名。

### L-2 提示注入与破坏性命令（低，设计如此）

- 位置：src/agent/protocol.ts 的 AGENT_SYSTEM_PROMPT
- 现状：模型可在沙箱内执行任意 shell。FASTCODE_SANDBOX 只是环境变量标记，
  不是内核级隔离；沙箱边界由本工具自身保证。
- 建议：对破坏性操作增加确认或 dry-run；在 README 明确告知用户。

### L-4 依赖面（低，待办）

- 现状：生产依赖 18 个直接包（ink、react、marked、meow 等）。
- 建议：定期 npm audit，保留 lockfile。

## 二之二、0.1.6 / 0.1.6-beta 追加的缓解

- **L-2 提示注入与破坏性命令**：已由 src/agent/guards.ts 的危险命令拦截缓解。
  默认拦截 rm -rf、dd、mkfs、fork bomb 等；
  可用 FASTCODE_ALLOW_DANGEROUS=1 放行，或 FASTCODE_SHELL_ALLOWLIST 收紧。
- **项目信任**：src/config/trust.ts + src/ui/TrustGate.ts，未信任目录不会直接启用 agent 工具。
- **输出上限**：src/agent/limits.ts 统一为边产边截断，避免超长输出撑爆内存。
- **文件工具沙箱**：全部走 `sandboxPath()`（含 apply_patch）；`sharedDirs` 是显式扩权。
- **请求韧性**：agent/stream.ts 空闲超时 + 零输出重试 + 断流识别。
- **上下文压缩**：agent/context.ts 超预算时保留首条与最近消息，避免 400 直接终止。
- **密钥迁移**：auth v3 自动迁移并保留 `auth.json.v2.bak`，降低数据丢失风险。
- **分发模型（自包含打包）**：dist/cli.js 由 esbuild 把依赖与 cfonts 字体内联后提交进 Git，
  用户 `git clone` 后免 `npm install` 运行——不执行任何安装期脚本（npm install scripts），
  依赖版本锁定在提交产物中。代价：需信任所提交的 dist/cli.js；构建可复现
  （`cd package && npm install && npm run build`，产物可 diff 核验）。

### 新增需注意项（L-5）

- 位置：src/session/log.ts
- 现状：会话以 JSONL 落盘到 ~/.fastcode/sessions，对话内容（可能含源码片段与密钥粘贴）
  会明文保存。
- 建议：默认已有 256MB 上限与最旧优先剪枝；可用 FASTCODE_SESSION_LOG=0 关闭。
  若设备与他人共用，建议关闭或把 FASTCODE_HOME 放到私有目录。

## 三、统计（0.1.6-beta 历史快照）

| 级别 | 已修复 | 待办 |
|---|---|---|
| 高 | 2 | 0 |
| 中 | 2 | 2 |
| 低 | 2 | 2 |

> L-1 的“单文件大小上限”已修复，但正则 ReDoS 部分仍待办。
> 当前版本统计、开放项与风险排序见第八节。

## 四、如何复现与回归

    cd package && npm install && npm run build
    node scripts/smoke-test.mjs

smoke-test 覆盖：dist 语法、服务商注册表、SSE 的 CRLF/LF 分帧、
悬空软链接容错、软链接越界读写拦截、词法越界拦截、config 与 auth 的分离、
provider 级 Key 复用、v1/v2 迁移。

## 五、0.1.6-beta 工程改造补记（2026-10-23）

新增/加强的保护（详见 ARCHITECTURE §5.1）：

- **工具契约**：registry 启动断言 `requiresTrust ⇒ revalidate:["trust"]`；prepare 拒绝零副作用。
- **process-tree**：POSIX 杀进程组，Windows `taskkill /T`；/kill 与 abort 共用。
- **patch**：parse→plan→apply 全量内存规划后才落盘；O_NOFOLLOW；rename 前 lstat；
  符号链接拒绝；CRLF/mode 保持；move 不覆盖；多文件失败回滚。
- **trust v1**：`paths` 用 realpath；旧 `trusted[]` 迁移；每次 approve 重读（mtime memo）。
- **facts/projection**：append-only 事实流；projection + fingerprint；未配对 tool_call 按幂等性补全（0.1.7 工作树已把投影上限提升到约 200KB，见第六节）。
- **SSE/retry**：25s idle（可调）；公共前缀去重；429 到上限抛 QuotaError。
- **后台 shell**：默认 2s 转后台；`/jobs` `/attach` `/kill`；`FASTCODE_MAX_SPAWN_PER_TURN`。

仍未关闭：

- **IME 光标定位**（Ink 5.x）：pty 尺寸异常时会 `abcdef` → `bcdefa`/裁切；修正 pty 后基本输入通过，`/edit` 是绕行。
- **approval pending UI/resolver**：review 命中 pending 时 fail closed，用户无法在 TUI 内批准。
- **string-width 三版本**：歧义宽度可能导致边框/光标列宽不一致。
- 原生 tools 只覆盖 OpenAI 兼容 provider。

回归：PC 115 项；Termux 120/120（含 #50/#51/#54、kill -9、/sdcard fsync、进程组 kill）。

## 六、0.1.8-beta.0 工作树补充（2026-11-09，基于 tag `v0.1.7`）

本轮针对 shell 会话、退出收口和 TUI 的补充修复：

- **shell 状态**：`close` 退出码 0 记为 `done`；每条 resident 命令包进子 shell，`export`/`umask`/`set -e`/`exit` 不跨命令；resident 池默认 2、`/threads` 最大 6；resident 满额排队。
- **双路径记账**：one-shot（Windows、交互/REPL 判定命令）由 `FASTCODE_MAX_SPAWN_PER_TURN`（默认 8/轮）单独限制，满额立即失败、不排队；两套预算不共享。`active` 统计 resident + one-shot，`pool/maxPool` 只算 resident。
- **退出/中断安全**：`Esc` 取消并保留部分输出；run 中 `Ctrl+C` 第一次取消、第二次退出；run 中 `/exit` 需 5s 内二次确认。确认后最多等 1000ms 落最终 facts，再 `shutdownShellsAsync`（SIGTERM → 等待 → SIGKILL），随后写 `session_end` + projection 并 best-effort fsync；`session_end.compaction` 预留压缩承接位。
- **TUI**：compact 状态栏 `effort` 重复渲染修复。
- **审批 feedback**：选择 “Deny with feedback” 后必须输入原因；TUI/plain 文本等待、JSON 要求 `input`、native `termux-dialog text`，空/缺失输入 fail-closed，不再把提示语当作用户反馈。
- **压缩/恢复**：`/compact` 现在写 `compacted` fact（含 `summaryRef`），`/clear` 写 `cleared` fact；摘要按 Notes/Outcomes/Files 优先并带 limit marker；新压缩清理本会话旧 `summary-*.md`。投影上限从 19KB 提高到约 200KB，工具载荷折叠为编辑事实，裁剪时插入 dropped marker 并保护 summary marker；`/context` 读取实际 env 配置。

仍存边界（未在本轮关闭）：

- one-shot 跨 turn 未结束的进程仍占并发，没有全局回收上限；`setsid` 后代可能逃逸 `shutdownShellsAsync`。
- 命令内再起的后台子进程不计入 resident/one-shot 预算。
- ReDoS 执行超时、写路径 TOCTOU、egress 未覆盖出口、Tier 3 备份前置等仍按 `CONFIGURATION.md`/`ARCHITECTURE.md` 所列边界处理。

验证：Windows `npm test` **282/282**（POSIX 专属用例跳过）；`verify-artifacts` 通过；`release/` 已生成 0.1.8-beta.0 资产；npm `beta=0.1.8-beta.0`；手工核对 one-shot 记账、`/threads` clamp、`session_end` 保存口与 `shutdownShellsAsync`。Termux/POSIX 真机待复跑。

## 七、2026-11-15 审计修复（已随当前版本发布）

依据 `yq.txt` 的 A–D 线与 F/J/G/C/A/K/B/D/E/H 审计项：

- **A1 单行读取绕过上限**：`readFileRange` 先算 `budget = maxBytes - returnedBytes - 1`，UTF-8 安全裁切后再入结果；实测 1.2MB 单行 `limit:1` 返回 ≤200000 字节。
- **A1 结构性兜底**：`limits.ts` 新增 `toolMessageLimit`/`boundToolMessage`，runner 写 `role:"tool"` 前统一按默认 1MB 截断。
- **A2 压缩正则**：摘要只采样前 64KB，`collectFiles` 正则加 `{1,240}`，`clip` 的 `\s+` 限长；1.2MB 单行压缩 <2s。
- **A3 压缩不收敛**：回收率 <10% 时把 >20KB 的 tool/user 消息瘦身到 8KB。
- **B5 方言静默吞掉**：已支持 Hermes/Qwen、Mistral（pre-v11/v11+）、Kimi K2、Llama（tag/裸 JSON）；`parseToolCalls` 返回 `detectedDialects`，检测到标记但 0 调用 → `errors` + `protocol_error`，不再记 `complete`；`stripToolCalls` 只删已识别的良构块。
- **B1/B2/B4**：无 index 多 chunk 按 id/单条目归并；对象 `arguments` 归一；非流式 JSON 兜底。
- **C1/C4 配额**：仅 402/429 或 billing/quota/balance 类关键词走配额提示；`retryStream` 抛 `QuotaError`。
- **C2 悬空 tool_calls**：请求前 `pairToolMessages`；提前 break 补 `role:"tool"` 占位。
- **C3 旧文本**：`stream_error` 重置 `lastVisible`。
- **F/J/G/C/K**：headless 失败退出码非 0；目录 0700/文件 0600；config 损坏 `.bak` + 提示；SSE 与 `requestIdleTimeoutMs` 统一。
- **D2/D4**：custom 认证头/额外头；probe 使用 `modelsPath`，`null` 不误报 offline。
- **B/D/E**：非法 model ID、`sessions show` 不存在 id、`trust --forget` 空值/不存在返回非零。
- **失败语义批次（第二轮 yq.txt）**：session append 写失败 → stderr + degraded + 跳过 projection + 幂等 close；TUI `approval` fact / headless `gate:decision` 帧；`probeProviderDetailed` 错误归因；`incomplete` error 事件 + terminal latch；`protocol_error` 独立终止；退出码映射见 `ERROR_SEMANTICS.md`。
- **方言批次**：Hermes/Qwen、Mistral、Kimi K2、Llama；`detectedDialects` 结构性防线。

仍存边界：

- 用户输入的 `grep` 正则仍无执行超时/子进程隔离（通用 ReDoS 未关闭）；本轮只关闭 `collectFiles` 已知 O(n²)。
- 写路径 realpath/lstat TOCTOU、egress 未覆盖出口、Tier 3 备份前置、ProxyAgent、`/egress` 命令仍未做。
- `listModels` 仍静默回退静态表（probe 已能给出原因）；tool-call 生命周期 kind、外部模型目录、CLI 后端接入未做。

验证：当时 Windows `npm test` **325/325**；`typecheck`/`lint`/`build`/`verify:artifacts` 通过；新增错误语义与执行后端回归（protocol_error、incomplete、retryable、auth 损坏、degraded 会话、幂等 close、审批决策帧、probe 归因、terminal latch、五种方言、事件装配、环境白名单、脱敏、NDJSON、只提议、abort）。后续 #150–#152 收尾后 PC smoke 为 **355/355**；Termux 真机待复跑。

## 八、当前版本安全与健壮性复核（2026-11-21）

### 8.1 基线与结论

- 基线：`package/package.json` 当前版本；对应发布 tag；npm `beta` 与 GitHub Release 已发布；复核提交 `52436d7`。
- 方法：逐模块复核安全边界（沙箱、Guardrails、egress、审批、trust、shell、patch、stdio）与健壮性路径（限界、SSE、协议、压缩、会话、headless、i18n）；对照 `scripts/smoke-test.mjs` 覆盖；复核发布资产与依赖审计。
- **结论**：beta.1→beta.2 的变更本身未发现新的高危回归。复核发现 2 个高危历史遗留问题（B2-01 悬空符号链接写入逃逸、B2-02 `resume` 任意文件覆盖）；**本轮已修复并通过 PC 回归（已随正式版发布）**。继续验证发现 B2-01b 硬链接写入逃逸；**本轮同样已修复（已随正式版发布）**，仍需 Termux/POSIX 真机复验。中危边界见下文。旧文档中“H-1 已修复”“auth.json 恒拦截”“每个副作用工具都重新校验 trust”“incomplete 覆盖所有提前结束”等表述过强，已在下文与相关文档中收紧。
- 影响：已发布版本仍含 B2-01/B2-01b/B2-02；三项均已在正式版修复并发布；Termux 复验仍待完成。

### 8.2 高危（建议下个补丁优先处理）

#### B2-01 悬空符号链接可把写入引出沙箱（历史 H-1 不完整，已修复，待 Termux 复验）

- 证据：`src/agent/tools/paths.ts:59-72` 的 `sandboxPath` 在 `realTarget` 存在时比较 realpath，但最终返回**词法路径**；`realpathOf`（`:74-92`）对不存在的路径向上找已存在祖先，因此**悬空链接**被当成普通缺失路径，判定为“在沙箱内”。`write_file`/`append_file`/`copy_file` 随后直接对词法路径调用 `writeFile`/`appendFile`/`copyFile`，会跟随链接（`write_file.ts:24-27`、`append_file.ts:24-27`、`copy_file.ts:36-49`）。
- 利用链：在已信任项目内 `shell` 创建 `ln -s ~/.ssh/authorized_keys link`（`guards.ts:786-797` 只检查链接目标是否为敏感写入，不阻止普通链接创建），再 `write_file({path:"link"})`。egress 只评估字符串 `link`（`policy/egress.ts:205-224`），看不到解析后的敏感目标。
- 影响：可在沙箱外创建/覆盖文件（`~/.ssh/authorized_keys`、`.git/hooks/*`、shell rc、`~/.fastcode/config.json` 等），绕过 `.env`/`sessions` 的 egress 路径保护。
- 状态：**已修复（已随正式版发布）**。新增 `src/lib/realpath.ts` 逐组件解析符号链接（含悬空链接）；`sandboxWritePath` 返回解析后的写目标；`write_file`/`append_file`/`copy_file` 使用 `O_NOFOLLOW` + `assertNotSymlink`；egress 的 `normalizeTarget` 走 `realpathOf`。Windows 最终文件 symlink 用例仍因 `EPERM` 跳过；悬空目录 junction 祖先用例已通过；Termux/POSIX 待复跑。
- 回归：`scripts/smoke-test.mjs` 新增悬空链接 write/append/copy、悬空祖先目录、沙箱内悬空链接用例；Windows 无 symlink 权限时最终文件用例跳过，目录 junction 用例可运行。

#### B2-01b 硬链接写入可绕过沙箱（本轮继续验证新发现，已修复，待 Termux 复验）

- 证据：`realpathOf` / `sandboxWritePath` 只解析符号链接；硬链接没有“目标路径”，`assertNotSymlink` 也看不到；`O_NOFOLLOW` 只拦 symlink。`guards.ts:786-797` 的 `ln` 分支只检查目标是否为敏感写入或共享存储，不阻止把沙箱外文件硬链接进来。
- 修复前复现（Windows）：`fs.linkSync(outside.txt, sandbox/hardlink)` 后执行 `write_file({path:"hardlink", content:"PWNED"})`；结果 `ok:true`，`outside.txt` 内容变为 `PWNED`。同一文件系统内的 `~/.ssh/authorized_keys`、home 下 `.env` 等均可作为硬链接源。
- 影响：模型在已信任项目内通过 `shell` 创建硬链接，再用写工具修改沙箱外文件；egress 也看到沙箱内路径，不会命中 denyPaths。
- 建议：写/追加/覆盖前检查目标 `nlink`（拒绝多链接目标），或对 `write_file`/`copy_file` 使用同目录 tmp + rename 以断开硬链接；`append_file` 对 `nlink>1` 直接拒绝；同时收紧 `ln`/`cp -l` 等入口。
- 回归：Windows `fs.linkSync` 4 项 + 普通追加已转绿（write/copy/replace 断开链接，append 拒绝硬链接、正常文件仍可追加）。
- 状态：**已修复（已随正式版发布）**。`write_file`/`copy_file`（overwrite）/`replace_in_file` 改为同目录 tmp+rename（断开硬链接）；`append_file` 在 open 后检查 `nlink>1` 并拒绝。
- 残留：`append_file` 的 fstat 检查仍有检查-写入窗口；当前工具调用串行，风险低；若要完全消除，需改为 read+tmp+rename 或 inode 级隔离。

#### B2-02 `resume <任意文件>` 会用投影覆盖原文件（数据丢失，已修复）

- 证据：`resolveSessionFile` 只按“是否含分隔符/`.jsonl`”决定路径（`src/session/log.ts:280-283`）；`projectionPath` 只替换小写 `.jsonl` 后缀（`:59-61`）。`resume ./notes.txt` 会 `openSessionLog` 追加 `session_start`（`:247-251`），关闭时 `ensureProjection → writeProjection` 的 `target` 仍是 `./notes.txt`（`session/projection.ts:531-537`），最终 `renameSync(tmp, notes.txt)` 覆盖原文件（`:589-599`）。大小写变体 `S.JSONL` 同样不匹配。
- 只读验证（修复前）：`projectionPath("./notes.txt") === "./notes.txt"`，`projectionPath("S.JSONL") === "S.JSONL"`；修复后 `projectionPath("S.JSONL") === "S.projection.json"`，且 `writeProjection` 拒绝 `target === source`。
- 影响：用户一旦把非会话文件传给 `resume`（误操作或脚本），原文件被 JSON 投影替换，且原内容不再存在。
- 状态：**已修复（已随正式版发布）**。新增 `resolveResumeFile`（仅接受 `sessions/` 下的会话 id 或 `.jsonl` 文件）；`projectionPath` 改为大小写不敏感；`writeProjection` 拒绝 `target === source`。
- 回归：`scripts/smoke-test.mjs` 新增 6 项（拒绝 `./notes.txt`、拒绝 sessions 外 `.JSONL`、保留裸 id、接受 sessions 内 `.jsonl`、大小写映射、projection 不得覆盖源）；PC 全量 **369/369** 通过。

### 8.3 中危

#### B2-03 `soft_gate` shell 在未信任目录可绕过 trust 门禁（2026-11-22 已修复）

- 状态：`registry.approve` 在 shell Hard Block 之后、soft-gate 之前检查 trust；未信任目录即使批准一次 soft-gate 也会返回 `not trusted`。回归覆盖 `rm -f marker.txt` + resolver allow。
- 证据：`src/agent/registry.ts:118-122` 在 soft-gate 分支直接返回 `pending`/`allow`，trust 检查在 `:127-132` 之后才执行；`shell` 声明 `requiresTrust: true`（`src/agent/tools/shell.ts:8-10`）。headless 的审批解析器存在（`src/headless.ts:96-120`），用户确认后即可在未信任目录执行 soft-gate 命令；TUI 的 `TrustGate` 会掩盖该路径。
- 影响：`git reset --hard`、`rm -f`、`git clean -fd` 等命令在未信任目录经一次确认后执行；不含路径参数的命令在 `always` 批准后可按相同指纹复用。
- 建议：把 trust 检查提前到 soft-gate 分支之前，或对 `shell` 无条件要求 trust。

#### B2-04 HTTP SSE 提前 EOF 被当作正常完成（2026-11-22 已修复）

- 状态：`openaiCompatible` 要求 `[DONE]` 或 `finish_reason`，`anthropic` 要求 `message_stop`；缺失时抛 `IncompleteStreamError`。smoke 已覆盖真实 HTTP SSE 截断。
- 证据：`src/providers/openaiCompatible.ts:179-219` 和 `src/providers/anthropic.ts:81-110` 在 `for await (streamSSE)` 正常结束后无条件 `yield {done:true}`；`src/agent/stream.ts:103-112` 只在 `sawDone === false` 时标记 `incomplete`。因此未收到 `[DONE]`/`message_stop` 的连接提前关闭会被记为 `complete`，可能执行被截断的最后一次工具调用。
- 覆盖缺口：现有 smoke 的 incomplete 用例使用 mock provider（`scripts/smoke-test.mjs` 的 incomplete 段），未覆盖真实 HTTP 解析器。
- 建议：记录终止标记；循环正常结束但未见到终止标记时抛 `IncompleteStreamError` 或返回 `incomplete:true`。

#### B2-05 `grep.glob` / `.fastcodeignore` 的 glob→RegExp 可被放大（2026-11-22 已修复）

- 状态：glob 长度上限 256、`**` 上限 4；`.fastcodeignore` 上限 256KB / 2000 条 / 单条 glob 同上。permissions regex 与 grep pattern 增加 512 字符上限并拒绝嵌套量词；`grepFiles` 编译前也检查。
- 证据：`src/agent/tools/readers.ts:248-274` 把每个 `**` 直接展开为 `.*` 且不限制 glob 长度/`**` 数量；`src/agent/ignore.ts:119-143` 同样处理。模型可传 `grep.glob`，克隆仓库可提供 `.fastcodeignore`（`ignore.ts:80-88` 用 `readFileSync` 无上限读取）。
- 影响：大量 `**` 与长路径可造成多项式回溯和 CPU 占用；超大 ignore 文件会被每次 `createIgnore()` 重读。
- 建议：限制 glob 长度与 `**` 数量、限制 ignore 文件大小/规则数；必要时给匹配加时间预算或改用非正则匹配器。

#### B2-06 `read_many` 单次 `maxBytes` 可覆盖总预算且无上限钳制（2026-11-22 已修复）

- 状态：`maxBytes` 钳制到 `FASTCODE_READ_MANY_MAX_BYTES`，schema 增加 `maximum:400000`；单文件异常改为 `[skipped]` 并继续，`filesSkipped` 正常计数。UTF-8 截断统一走码点边界，截断提示计入预算，`returnedBytes` 等于实际输出字节；grep 行上限改为 500 字节。
- 证据：`src/agent/tools/read_many.ts:15-17` 只校验 `>=1`，`:31-33` 直接使用调用方值；`src/agent/tools/readers.ts:18,30,290-294` 以该值分配/读取；schema 只有 `minimum`，没有 `maximum`（`src/agent/tool-schemas.ts:19-22`）。另外 `readManyResult` 对单个文件异常会整体失败（`readers.ts:24-31`），与 `filesSkipped` 的设计不一致。
- 影响：单次调用可要求极大读取量，造成内存/延迟尖峰；一个缺失路径会让其余已读结果全部丢弃。
- 建议：把 `maxBytes` 钳制到 `FASTCODE_READ_MANY_MAX_BYTES` 或合理上限；schema 加 `maximum`；逐文件 try/catch 并计入 `filesSkipped`。

#### B2-07 shell 内嵌文件路径不走 egress denyPaths（已知边界，文档已收紧）

- 证据：`src/agent/policy/egress.ts:293-296` 对 `shell` 只把命令字符串作为 payload，不解析其中的路径；`guards.ts` 的凭据读取只覆盖 `id_*`/`/etc/shadow`/`/etc/sudoers`（`guards.ts:557-573`、`:729-744`），`cat ~/.fastcode/auth.json` 在“安全命令”矩阵中被放行。输出侧仅靠内容标记兜底（`DEFAULT_CONTENT_MARKERS`），`sk-ant-…`/`sk-proj-…` 等带连字符的 key 可能不匹配。
- 状态：`ARCHITECTURE.md` §5.1 已写明 shell 路径是启发式；`CONFIGURATION.md` 原先“auth.json + sessions 恒拦截”的表述已改为“工具路径恒拦截，shell 路径仍为启发式”。2026-11-22 复核：`sh -c "cat /etc/shadow"`、`bash -c "cat ~/.ssh/id_rsa"` 已由 Hard Block 覆盖；精确边界是“敏感文件本地读取不拦，外传才拦”。
- 建议：若要求默认阻断 shell 路径，需解析 shell AST 并对路径参数套用 egress；否则在用户文档中明确该边界。

#### B2-08 压缩在短历史/中等消息下可能不收敛，summary 文件会累积（2026-11-22 已修复）

- 状态：短历史会动态减少保留尾部以压缩中间消息；headless 与 `pruneSessions` 清理 summary；投影对 `toolCalls[].arguments` 截断并执行 200KB 硬上限。8–20KB 尾部重复瘦身仍按现有 20KB 阈值处理，属性能边界。
- 证据：`src/agent/compaction.ts:125-129` 在 `tailStart <= headCount` 时直接 noop，≤13 条消息即使超窗也不压缩；`:145-157` 的瘦身阈值是 >20KB，8–20KB 的尾部消息可能每轮重复触发；`:132` 每次本地压缩写 `summary-*.md`，清理只在 TUI 的 `appendCompactionFact`（`src/app.ts:747-753`），headless 与 `pruneSessions` 不清理（`src/headless.ts:156-157`、`src/session/log.ts:434-447`）。
- 另：投影 200KB 不是硬上限，`toolCalls[].arguments` 未截断，单条消息时 `overBudget()` 放行（`src/session/projection.ts:467-475,489`）。
- 建议：短历史也允许压缩；降低瘦身阈值或按比例迭代；headless/剪枝统一清理 summary；投影对 arguments 也做截断。

### 8.4 低危 / 信息

- **B2-09（2026-11-22 已修复）** `config.language` 非法类型会让 i18n 崩溃：`normalizeLocale` 直接 `.trim()`（`src/i18n/index.ts:28-33`），`config/store.ts` 合并原始 JSON 未校验；`"language":123` 会使 `resolveLocale()` 及 `/help`、`/about`、StatusBar 抛错。建议在读取时强制 `String()`/类型检查。
- **B2-10（2026-11-22 已修复）** `applySummary` 直接 `readFileSync(latest.summaryRef)`（`src/session/projection.ts:228-247`），不校验路径是否在 `sessions/` 下、不限制大小；恶意/共享 JSONL 可把本地文件内容注入模型上下文。建议复用 `removeSummaryFile` 的路径校验。
- **B2-11（进程树部分已修复）** 进程树升级会被直接子进程退出取消：`src/lib/process-tree.ts:99-112` 在 `child.once("exit")` 清除 SIGKILL 计时器，忽略 SIGTERM 的同组后代可能存活；`src/lib/lifecycle.ts:33-44` 在信号路径同步 `shutdownShells()` 后立即 `process.exit`，未等待 escalation。`setsid` 逃逸仍是已知边界。
- **B2-12（2026-11-22 已修复）** 配置临时文件与 auth 备份的权限：`src/config/store.ts:360-366` 的 `atomicWrite` 以默认 mode 写 tmp，`saveAuth` 在 rename 后才 `lockdown`（`:246-250`）；`auth.json.v2.bak`/`.corrupt.bak` 不在 `egress` 内置 denyPaths 的 `auth.json` 子树内。建议写 tmp 前 chmod 0600，失败清理 tmp，并把备份纳入 denyPaths。
- **B2-13（2026-11-22 已修复）** provider 错误正文与工具输出未统一 `redactSecrets`：`src/lib/http.ts:13-15,34-36`、`src/providers/openaiCompatible.ts:107-122` 会截取并抛出错误正文，随后可进入会话 JSONL；`redactSecrets` 目前只用于 stdio stderr。建议在错误落盘/展示前统一脱敏。
- **B2-14（2026-11-22 已修复）** `usage` 重复告警已去重；`isCallBoundary` 改为只检查 256 字符后缀，避免 O(n²)（`src/agent/protocol.ts:64-69`）；fallback 现在替换任意位置的 native 块并保留 caller 后缀；400 重试只匹配参数名附近的 unsupported，不再因 “tools are unsupported” 误重试；`systemPromptForFallback` 依赖尾部 native 块（`:772-779`），调用方在块后再追加文本会静默不替换；400 compat 重试匹配裸词 `unsupported`（`src/providers/openaiCompatible.ts:111-118`），可能对 “tools are unsupported” 先浪费一次同 tools 请求。均为低危/延时场景。
- **B2-15（依赖审计）** `npm audit --omit=dev` 为 **0** 个漏洞；全量 `npm audit` 有 6 个 moderate，均来自开发依赖 `@typescript-eslint/* → minimatch`（不进入发布包）。建议随工具链升级处理。
- **B2-16（信息）** smoke 运行出现 Node `DEP0169`：`url.parse()` 行为不受标准化且可能有安全影响；当前不影响功能，建议后续替换为 WHATWG URL。

### 8.5 已确认缓解（本次复核仍成立）

- Hard Block / Soft Gate 分层且 Hard Block 不可被 `FASTCODE_ALLOW_DANGEROUS` 或 trust 覆盖；AST 只升级不降级（`guards.ts`；smoke Hard Block 矩阵）。
- egress 默认 `enabled:true + mode:"block"`；内置 `auth.json`/`sessions/` denyPaths；block 在审批前返回 `EGRESS_DENY`、不写 `trusted.json`；outbound 超预算 fail-closed（`policy/defaults.ts`、`policy/egress.ts`、`registry.ts:143-155`；smoke egress 段）。
- 审批 fail-closed：无 resolver、超时、非法选项、cancel、空 feedback 均拒绝；`always`/`session` 批准绑定 `catalogHash`（`approval.ts`、`approval-json.ts`、`approval-store.ts`；smoke approval 段）。
- 已存在目标的符号链接会被沙箱拒绝；`apply_patch` 使用 `O_NOFOLLOW` 临时文件、rename 与回滚（`tools/paths.ts:59-72`、`patch/apply.ts:79-139`；smoke symlink/patch 段）。
- 悬空链接与悬空祖先：`lib/realpath.ts` 逐组件解析；`sandboxWritePath` 返回真实写目标；write/append/copy 使用 `O_NOFOLLOW` + `assertNotSymlink`；egress 目标也走 `realpathOf`（B2-01）。
- `resume` 只接受 `sessions/` 下的 id/`.jsonl`；`projectionPath` 大小写不敏感；`writeProjection` 拒绝覆盖源文件（B2-02）。
- stdio 后端只提议工具不执行；子进程环境 allowlist、stderr 脱敏、abort 进程树终止（`providers/stdioBackend.ts`、`lib/child-env.ts`；smoke stdio 段）。
- 会话写失败 degraded + 跳过 projection/fsync/prune；projection manifest 防篡改；summary 删除路径校验（`session/log.ts`、`session/projection.ts`、`agent/compaction.ts`；smoke session/projection 段）。
- 发布资产卫生：npm tgz 与 portable tar.gz 中未发现 `auth.json`/`.env`/`sessions/`；`SHA256SUMS` 三份哈希与文件一致。

### 8.6 本次验证

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（重建 `dist/cli.js` 与新增 `dist/lib/realpath.js`）。
- `node scripts/smoke-test.mjs`：**ALL PASS (369/369)**（Node v24.20.0，2026-11-21；Windows 最终文件 symlink 用例跳过，悬空目录 junction 与硬链接 4 项 + 普通追加通过）。
- CLI 复验：`fastcode resume <非 .jsonl 文件>` 退出码 1，原文件内容逐字节不变。
- 硬链接复验：Windows `fs.linkSync` 4 项 + 普通追加通过；write/copy/replace 不再修改沙箱外文件，append 拒绝硬链接目标且正常文件可追加。
- `npm run verify:artifacts`：通过（`dist/cli.js` 5 个 guard markers，bundle 2,223,320 bytes）。
- `npm audit --omit=dev`：0 漏洞；全量 dev 依赖 6 个 moderate（见 B2-15）。
- 发布资产 SHA256 复核通过；未发现会话/密钥文件。
- 未做：Termux/POSIX 真机复跑、真实 provider 端到端、Windows 最终文件 symlink 复现（本机 `EPERM`；目录 junction 祖先已覆盖）。
- 后续协议/参数、统一事件流、能力目录/结构化 diff、回滚/指令/权限/诊断、外置扩展/plan/worktree 批次后：Windows smoke **447/447**，bundle 2,223,320 bytes；安全回归仍通过。

### 8.7 风险排序与建议

| 优先级 | 项目 | 建议动作 |
|---|---|---|
| P0 | B2-01 悬空链接写入逃逸 | **已修复（已随正式版发布）**：逐组件 realpath + `sandboxWritePath` + `O_NOFOLLOW`；待 Termux 复验 |
| P0 | B2-01b 硬链接写入逃逸 | **已修复（已随正式版发布）**：write/copy/replace 用 tmp+rename 断开链接；append 拒绝 `nlink>1`；Windows 回归通过 |
| P0 | B2-02 `resume` 任意文件覆盖 | **已修复（已随正式版发布）**：`resolveResumeFile` + projection 断言；PC 回归通过 |
| P1 | B2-03 soft-gate shell 绕过 trust | **已修复（2026-11-22）**：Hard Block 后、soft-gate 前检查 trust |
| P1 | B2-04 HTTP EOF 当 complete | **已修复（2026-11-22）**：真实 SSE 缺终止标记抛 `IncompleteStreamError` |
| P1 | B2-05 glob/ReDoS / ignore 无上限 | **已修复（2026-11-22）**：glob/`**`≤4/ignore 大小与规则数；permissions 与 grep regex 设 512 字符与嵌套量词限制 |
| P1 | B2-06 `read_many.maxBytes` 无上限 | **已修复（2026-11-22）**：钳制到总预算；单文件错误隔离；UTF-8 码点/提示预算一致；grep 行按字节 |
| P2 | B2-07 / B2-08 | B2-07 保留边界；B2-08 **已修复**：短历史压缩、summary 清理、投影参数截断/硬上限 |
| P3 | B2-09–B2-16 | B2-09/10/11/12/13/14 已修；B2-15/16 依赖/信息项 |

### 8.8 与旧文档的差异（本次已收紧）

- AUDIT H-1“符号链接逃逸已修复”→ 悬空链接路径曾可写入；本轮已在工作树修复，见 B2-01。
- CONFIGURATION“auth.json + sessions 恒拦截”→ 仅工具路径；shell 内嵌路径仍为启发式，已加注。
- CONFIGURATION“每个副作用工具执行前重新读取 trust”→ soft-gate shell 分支例外，已加注。
- ERROR_SEMANTICS“提前结束 → incomplete”→ HTTP provider 纯 EOF 可能记为 complete，已加注。
- CONFIGURATION “read_many 总预算”→ 单次 `maxBytes` 可覆盖且无上限，已加注。
- ARCHITECTURE “投影约 200KB 上限”“压缩避免每轮必压”→ 均非硬保证，已加注。
- 第三节“高 2 已修复 / 待办 0”是 0.1.6 历史统计；已发布 beta.2 含 B2-01/B2-01b/B2-02，工作树已修复，见本节。

### 8.9 shell 权限模型（当前版本复核）

**结论**：`shell` 是“已信任用户的完整 shell 逃生门”，不是沙盒。Guardrails/egress 只做手滑与敏感路径的启发式拦截；`FASTCODE_SANDBOX*` 只是环境变量标记，不做隔离。

#### 8.9.1 执行条件

- `shell` 声明 `requiresTrust: true`、`revalidate:["trust","sandboxRoots"]`（`tools/shell.ts:8-10`）；Hard Block 之后、`soft_gate` 之前检查 trust（`registry.ts`，见 B2-03）。
- 未信任目录：普通 `allow` 与 `soft_gate` 命令都会被 trust 拒绝；只有 Hard Block 文案优先（B2-03 已修复）。
- `FASTCODE_TRUST_ALL=1` 跳过 trust；`FASTCODE_ALLOW_DANGEROUS=1` 只绕过 soft gate，不能绕过 hard block。
- `cwd` 参数被拒绝（`tools/shell.ts:19-20`），但命令可自行 `cd` 到任意目录。

#### 8.9.2 进程身份

- resident：`spawn("sh", ["-s"], { cwd, env: { ...process.env, FASTCODE_SANDBOX:"1", FASTCODE_SANDBOX_ROOT:cwd }, detached: POSIX })`（`shell-session.ts:206-213`）。
- one-shot：`spawn(command, { cwd, shell:true, env: ... })`（`shell-session.ts:508-516`）。
- 与 FastCode 同用户、同 OS 权限；无 chroot/容器/seccomp/landlock；`FASTCODE_SANDBOX*` 不被内核解释。
- 继承完整 `process.env`（可能含用户导出的 API key、代理、云凭据）；与 stdio 后端的 `lib/child-env.ts` allowlist 不同。

#### 8.9.3 文件与网络

- 文件：按用户权限读写；项目外非敏感路径（`~/.bashrc`、`~/.config`、`/tmp` 等）可写；共享存储重定向 hard block；已识别的敏感名称/目录（`.ssh`、`authorized_keys`、`.env`、`auth.json`、`trust.json`、`sessions`、`.git/hooks` 等）写入/删除/移动/截断 hard block（`guards.ts:557-559,760-797,1163-1182`）。
- 读取：`cat ~/.fastcode/auth.json`、sessions 允许（smoke 安全命令矩阵）；只 hard block `id_*`、`/etc/shadow`、`/etc/sudoers` 等关键项（`guards.ts:560-568,729-744`）。
- 网络：无限制；仅在命令中同时识别到敏感文件与网络 sink 时 hard block（`guards.ts:746-758`）；egress 只扫描命令 payload 与输出内容标记，不解析 shell 路径（B2-07）。
- 默认内容标记不覆盖带连字符的 key（`sk-proj-…`、`sk-ant-…`）；`redactSecrets` 只用于 stdio stderr（B2-13）。
- 输出窗口 256KB/任务；resident 池默认 2（可调 6）；每轮 spawn 预算 8。

#### 8.9.4 防护层级

- Hard Block：根/系统递归删除、fork bomb、远程代码管道、`/dev/tcp`、块设备、共享存储重定向、已识别敏感写入/移动/删除、关键凭据读、敏感文件+网络 sink、非字面量 `eval/source/-c` 等（`guards.ts:1134-1182`）。
- Soft Gate：`rm`/`git reset`/`git clean`/truncate/`printenv`/allowlist 等；需审批；`FASTCODE_ALLOW_DANGEROUS` 可绕过。
- 声明式 `permissions.shell.allow/deny`：只作用于 Soft Gate；未信任项目的 `.fastcode` 权限层被忽略；Hard Block 不变。
- AST：只做 hard 升级；解析失败不降级（`guards.ts:86-97,461-479`）。
- Egress：默认 `block`；shell command 作为 payload 扫描；输出内容标记扫描；超预算 fail-closed。

#### 8.9.5 主要绕过面

- 解释器/脚本：`python -c`、`node -e`、`perl`、shell 脚本、base64、变量拼接、`sh -c` 等可绕过字符串规则；AST 只升级特定模式。
- 环境泄露：`printenv` 为软门禁；`/proc/self/environ` 或解释器 `os.environ` 不受同等限制。
- 敏感读取：`auth.json`/sessions 可读；输出标记不覆盖所有 key 形态。
- 文件路径：egress 不解析 shell 路径；项目外非敏感写入允许。
- 进程：`setsid`/后台后代可能逃逸 cleanup；SIGKILL 升级窗口（B2-11）。
- 信任：B2-03 已修复；soft-gate 在审批前检查 trust。

#### 8.9.6 建议

- 文档明确：shell = 已信任用户的完整 shell，不是 sandbox；不要把 guardrails 当安全边界。
- 若要收紧：① 复用 `child-env` allowlist 给 shell，至少不继承 API key；② 对 `auth.json`/sessions 的 shell 读取做 hard block 或输出脱敏；③ 扩展内容标记到 `sk-proj-`/`sk-ant-` 等，所有出口统一 `redactSecrets`；④ 解析 shell AST 路径并套 egress，或只允许 allowlist + 全量审批；⑤ 修复 B2-03 trust 顺序；⑥ 真隔离用 OS 级：Android/Termux app sandbox、独立低权限用户、容器/proot、seccomp/landlock、网络策略。