# 安全与健壮性审计报告 — FastCode 0.1.6-beta

审计对象：src/（114 个模块，由 dist 逆向重建后的源码）+ 构建脚本 + 部署方式。
审计方法：逐模块阅读、构造复现、用 scripts/smoke-test.mjs 固化为回归。

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
  指向 C:\Windows 等非允许位置的软链接（包括嵌套在共享存储内部的）仍被拒绝，
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

- 位置：src/agent/tools.ts 的 grepFiles()
- 修复：默认跳过 > `FASTCODE_GREP_MAX_BYTES`（1MB）的文件与二进制扩展名；
  `read_file/read_many` 默认 200KB 截断；`walk()` 支持 `.fastcodeignore`。
- 仍未解决：正则仍由模型输入直接构造，极端模式仍有 ReDoS 可能；
  建议后续限制 pattern 长度/复杂度或在子进程执行。

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

## 三、统计

| 级别 | 已修复 | 待办 |
|---|---|---|
| 高 | 2 | 0 |
| 中 | 2 | 2 |
| 低 | 2 | 2 |

> L-1 的“单文件大小上限”已修复，但正则 ReDoS 部分仍待办。

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
- **facts/projection**：append-only 事实流；projection <20KB + fingerprint；未配对 tool_call 按幂等性补全。
- **SSE/retry**：25s idle（可调）；公共前缀去重；429 到上限抛 QuotaError。
- **后台 shell**：默认 2s 转后台；`/jobs` `/attach` `/kill`；`FASTCODE_MAX_SPAWN_PER_TURN`。

仍未关闭：

- **IME 组合错位**（Ink 5.x）：`abcdef` → `bcdefa`；`/edit` 只是绕行。
- **approval pending UI/resolver**：review 命中 pending 时 fail closed，用户无法在 TUI 内批准。
- **string-width 三版本**：歧义宽度可能导致边框/光标列宽不一致。
- 原生 tools 只覆盖 OpenAI 兼容 provider。

回归：PC 115 项；Termux 120/120（含 #50/#51/#54、kill -9、/sdcard fsync、进程组 kill）。