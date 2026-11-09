# FastCode 架构说明

> 版本：0.1.8-beta.0（工作树；基于 tag `v0.1.7` + 2026-11-09 修复；已本地 build/打包，未发布）
> 适用：`package/src` 当前源码树与 `dist/cli.js` 构建产物
> 维护：改模块、命令、环境变量或安全语义时同步本文件

## 1. 分层

```text
┌─────────────────────────────────────────────────────────────┐
│ 入口层  bin/fastcode.mjs -> dist/cli.js（esbuild 自包含）     │
│                          -> dist/index.js（tsc 回退）        │
├─────────────────────────────────────────────────────────────┤
│ 命令层  cli-main.ts（TUI 之外）+ commands/*（斜杠命令）       │
├─────────────────────────────────────────────────────────────┤
│ 界面层  app.ts + ui/*（Ink/React；只渲染事件，不跑 agent）    │
│         headless.ts（--ui json / 非 TTY plain）               │
├─────────────────────────────────────────────────────────────┤
│ 编排层  agent/runner.ts（async generator）                   │
│         agent/registry.ts + tools/* + agent/policy/*          │
├─────────────────────────────────────────────────────────────┤
│ 领域层  providers/*（含 spec.ts） session/* skills/* plugins/*│
│         agent/guards.ts agent/shell-ast.ts approval*.ts       │
├─────────────────────────────────────────────────────────────┤
│ 基础层  config/*  lib/*（含 lifecycle.ts） patch/*  types.ts  │
└─────────────────────────────────────────────────────────────┘
```

原则：

- `agent/runner.ts` 不依赖 React；UI 只消费事件。
- 工具执行统一经过 `ToolRegistry`：prepare → egress → approve → execute。
- Hard Block 在 `guards.ts`，AST 只做第二意见；egress 在 `agent/policy/egress.ts`，默认 audit；审批在 `approval*`，不反向改 guard/egress 结论。
- 事实流 append-only；投影可重建；剪枝后仍保留带 manifest 的可验证投影。

## 2. 入口与命令

- `bin/fastcode.mjs`：优先加载自包含 `dist/cli.js`，回退 `dist/index.js` / `src/index.ts`。
- `src/index.ts`：调用 CLI；`--ui json` 走 headless，非 TTY 的 plain 走 headless，其余加载 Ink TUI。
- `src/lib/lifecycle.ts`：安装 SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底，调用 `shutdownShells()`；headless 同时响应 SIGTERM/SIGHUP 中止当前 run。
- `src/cli-main.ts`：meow 参数解析；provider/model/config/sessions/resume/trust/skills/doctor/update、`--ui`。
- `src/commands/*`：斜杠命令纯函数；`/provider`、`/model`、`/login` 无参数统一进入 app 的模型配置向导。CLI 子命令与全部 TUI 斜杠命令速查见 `CONFIGURATION.md` §8。
- `src/headless.ts`：无 Ink 运行器；stdout 只输出 NDJSON 协议/回答，诊断写 stderr。每个事件带 `v:1`、`seq`、`ts`；`tool_call` 与 `tool_result`（含 `output`、`side_effects`、`code`、`truncated`、行/字节统计）按发生顺序输出。

## 3. TUI 与交互

- `app.ts`：会话状态、`runAgent` 事件消费、Picker/Prompt、登录向导、审批 resolver。
- `ui/Picker.ts`：方向键、`1–9`、Enter、Esc；不直接持有权限逻辑。
- `ui/Prompt.ts`、`Message.ts`、`Spinner.ts`、`StatusBar.ts`、`TrustGate.ts`：纯展示组件。
- 模型配置向导：
  - `/provider` → provider Picker → model Picker → key（若 provider 需要）
  - `/model` → 当前 provider 的 model Picker（当前模型预选）
  - `/login` → provider → model → key
  - 取消不提交未完成配置；key 输入掩码；keyless provider 跳过 key。
- 审批交互：
  - `tty`：Ink Picker；默认选项为 deny。
  - `native`：`termux-dialog sheet`；严格校验 code/index，缺失/超时回落 tty。
  - `plain`：文本编号输入；无 TTY 时 headless readline。
  - `json`：NDJSON `gate:ask` / `gate:decision`；stdout 只输出协议。
  - feedback：选择 “Deny with feedback” 后进入文本等待；tty/plain 用 Prompt 输入，native 用 `termux-dialog text`（不可用回落 tty），json 要求 `input` 字段；空输入/缺失输入 fail-closed，不把提示语回传模型。
- Hard Block 不生成审批请求，不显示 Allow/Always/Force。
- 中断/退出保护：`Esc` 取消当前 run 并保留部分输出；run 中 `Ctrl+C` 第一次取消、第二次退出；run 中 `/exit` 需 5s 内二次确认。确认后最多等 1000ms 落最终 facts，再安全停止 shell、写保存口并退出。

## 4. Agent 与工具

- `agent/runner.ts`：单轮/多轮、流式、工具调用、预算、loop detection、compaction、checkpoint、resume 历史。
- `agent/registry.ts`：
  - `prepare → egress → approve → execute`；egress block 直接返回 `EGRESS_DENY`，不生成审批；
  - `stateScope` / `revalidate` 契约断言；
  - shell Soft Gate → `pending` ApprovalRequest；
  - Hard Block 直接 deny；
  - resolver 返回 allow/deny/feedback；无 resolver 或异常 fail-closed；
  - once/session/always 授权经 `approval-store`；always 写入 trust 并绑定 catalogHash。
- `agent/tools/types.ts` / registry：`ToolResult` 带 `code/hint/truncated/totalLines/returnedLines/totalBytes/returnedBytes/filesRead/filesSkipped/matches/egress/sideEffects`；错误码 `ENOENT/EEXIST/EISDIR/INVALID_ARGS/SANDBOX_DENY/APPROVAL_DENY/EGRESS_DENY` 等由 registry 统一映射。
- 工具契约：`read_file` offset/limit（1-based）、`read_many` 总字节预算、`grep` case/glob/context/maxResults、`replace_in_file` expectedMatches、`copy_file` 默认拒绝已存在目标、`delete_file` 目录需 recursive、`move_path` EXDEV 回退；sideEffects 与实际 fs 状态一致。
- `agent/tools/*`：15 个单文件工具；文件工具走沙箱路径；patch 三阶段 parse/plan/apply。
- `agent/protocol.ts`：`<fastcode_tool>` JSON 与 DSML 双方言；解析器返回 `{calls, consumedEnd, errors}`；残留标签抢救与重复解析防护。
- `agent/shell-ast.ts`：纯 JS `bash-parser` 第二意见，只升级 hard；只解析 `-c`、`find -exec`、`eval/source/.`、同段一次赋值；解析失败保持形状结果。
- `agent/runner.ts` 事件：`tool_call`、`tool_result`（output/sideEffects/code/truncated/行字节）、`usage`、`notice`、`egress_denied`、`error`、`done`；重试通过 `notice` 暴露；纯文本收尾走 `done.finalText`（headless 消费契约，见 G2 未决项）。

## 5. Guardrails

- `agent/guards.ts` 三态：`allow` / `soft_gate` / `hard_block`。
- Hard Block 包括：根/当前/父/home/变量/通配符/系统路径递归删除、源码目录递归删除、`find -delete`、force-push 受保护分支、`git clean -fdx`、`dd of=/dev/*`、mkfs/mke2fs/fdisk/diskpart/format、docker prune/全删、`kubectl delete --all namespaces`、`chmod/chown -R` 根或系统路径、shutdown/reboot/poweroff/systemctl stop、敏感文件（`.env` 家族、`.pem`/`*.key`/`auth.json`/`trust.json`/sessions 等）写入/删除/重命名/清空、敏感文件外传（管道到网络 sink、上传参数、`scp`/`rsync`、`base64`/`tar` 间接外带、共享存储重定向 → `sensitive_file_egress`）、关键凭据读取（`id_*`、`/etc/shadow`、`/etc/sudoers` → `critical-credential-read`）、`curl|sh`、`base64 -d|sh`、非字面量 eval/source/-c、`nc -e`、`/dev/tcp`。
- Soft Gate：普通文件/可重建目录删除、`git reset --hard`、`git clean -fd`、feature force-push、普通 `kubectl` ns/scale、普通 truncate/shred、裸 `printenv`/`env`。
- 普通敏感文件（如 `.env`、`auth.json`、`~/.ssh/config`）读取允许；`.env.example` / `.envrc` 显式放行。
- `FASTCODE_ALLOW_DANGEROUS=1` 只绕过 Soft Gate，不能绕过 Hard Block。
- AST 只做升级，不降级；解析失败保持形状匹配结果。

### 5.1 Egress 策略

- `agent/policy/egress.ts` 是纯策略模块；`registry.execute()` 在 prepare 后、approve 前调用，block 态直接返回 `EGRESS_DENY`，不生成审批请求、不写 `trusted.json`。
- 默认 `enabled:false + mode:"audit"`：工具行为不变，只记录 `egress_denied`；`enabled:true + mode:"block"` 才拦截；`mode:"off"` 是完整 kill switch。
- 已覆盖出口：工具路径读写/删/复制/移动/patch、工具 payload、shell command 内容标记、工具输出（返回模型前）、NDJSON/TUI/session 事件。
- 模式矩阵：`off` 放行且不审计；`audit` 放行并记录 `wouldBlock`；`block`（`enabled:true`）返回 `EGRESS_DENY`，resolver 不会被调用。outbound 扫描预算耗尽在 block 态 fail-closed；local write 内容只做 head/tail 扫描。
- 分层：shell 重定向到共享存储由 `guards.ts` 无条件硬拦截，独立于 egress 配置；`write_file`/`copy_file` 的共享存储写入走 egress 层，受 `mode` 控制。
- 未覆盖/边界：provider 网络请求正文、session JSONL 落盘正文、CLI 子命令输出、skills/plugins prompt 注入、TTS/share/clipboard（本轮无这些工具）、debug 日志；shell 路径判定仍是启发式，不是 shell 语义引擎。该策略是应用层防手滑，不是内核级访问控制。

## 6. 会话与恢复

- `session/log.ts`：append-only JSONL；`session_start` / `user` / `assistant_raw` / `tool_call` / `tool_result` / `notice` / `egress_denied` / `checkpoint` / `compacted` / `cleared` / `session_end`。`cleared` 之后的投影只从其后的事实重建；`sessionMetaFromFacts` 只采用首个 `session_start`，避免 resume 追加的新 start 改变 fingerprint。
- `close(info)` 写 `session_end{reason, compaction}`；`compaction` 是预留的压缩承接位（`source` / `summaryRef` / `pending`），当前默认 `none/null/false`。close/剪枝前写 projection，并对 JSONL 与 projection 做 best-effort fsync；`.projection.json` 保存 manifest：
  - `contentHash`：投影内容 sha256
  - `sessionHash`：源事实 sha256
  - `lastFactSeq`：覆盖的最高事实序号
- `ProjectionFingerprint` 固定 4 字段：`toolCatalogHash` / `modelId` / `cwdDigest` / `compactionSource`；`sameFingerprint` 逐字段严格相等，旧 4 字段投影仍可匹配。
- `session/projection.ts`：恢复先校验 manifest，再校验 fingerprint；事实晚于投影则重建；剪枝后只使用校验通过的投影；tool_call/tool_result 配对修复；`notice` 与 `egress_denied` 作为 system 消息保留（不会静默丢弃）。投影上限约 200KB、单条 8000 字符（保留头尾）；投影前把工具载荷折叠为“tool + target + ok/error + 关键错误”事实，裁剪时插入 `[projection] N earlier message(s) dropped …` 并保护 summary/compaction marker。
- 剪枝保留投影，删除原始 JSONL；旧格式/无 manifest 投影明确告警，不静默返回空会话；旧 JSONL 无新字段仍可 resume。

## 7. Provider、流与压缩

- `providers/*`：13 个 provider；`authEnv` 是 provider 级密钥候选；`capabilities.toolCalling` 缓存 native/pseudo；DeepSeek 默认模型为 `deepseek-flash`（显式 `deepseek-v4-pro` 仍可用）。
- `providers/spec.ts`：URL 路径/query/auth 头模板（`chatPath/modelsPath/query/pathParams/authHeaderName/authPrefix`）；占位符缺失时抛错、不发请求；现有 provider 不传新字段时 URL/header 与旧行为一致；`modelsPath:null` 不发在线列表请求。
- `lib/http.ts`：SSE 解析、UTF-8 单字节拼接、idle timeout `NetworkStallError`、连通性探测；`doctor --net` 使用该探测。
- `lib/net.ts`：retryRequest / retryStream，前缀去重，`QuotaError`；重试通过 `notice` 暴露（headless JSON 事件 / plain stderr）。`HTTPS_PROXY/ALL_PROXY` 尚未接入 ProxyAgent（已知边界）。
- `agent/compaction.ts`：token 阈值、heap 强制、server-aware 互斥（当前调用方未传 opaque state，实际不改变本地压缩）、summary 落盘与旧文件清理；摘要 section 顺序 Notes → Outcomes → Files → Requests → Actions，超限条目带 marker；参数可由 `FASTCODE_COMPACTION_RATIO` / `KEEP_TURNS` / `SUMMARY_TOKENS` 调整。`/compact` 追加 `compacted` fact，`/clear` 追加 `cleared` fact。
- `lib/model-meta.ts`：上下文窗口 / charsPerToken / supportsTools；用户可覆盖。

## 8. Shell 与进程树

- `agent/shell-session.ts`：两条执行路径，预算不共享。**resident**：POSIX 非交互命令，`sh -s` 池默认 2、`/threads` 可调至 6；池满时排队；每条命令包在子 shell 中（隔离 `export`/`umask`/`set -e`/`exit`）；含后台操作符时完成标记后回收该 resident。**one-shot**：Windows 或交互/REPL 判定命令，由 `FASTCODE_MAX_SPAWN_PER_TURN`（默认 8/轮，新建速率而非全局并发上限）限制，满额立即失败、不排队。`shellPoolStats().active` 统计所有运行中 job，`pool/maxPool` 只统计 resident；跨 turn 未结束的 one-shot 仍占并发。详见 `CONFIGURATION.md` §后台 shell。
- 超时/取消统一 `terminateProcessTree`：进程组 `SIGTERM` → grace → `SIGKILL`；ESRCH 视为已退出。
- 后台任务保留 timeout；转后台只解除前台 AbortSignal。
- `setsid` 后代仍可能逃逸；不扫描 `ppid=1`，错误信息明确边界。
- `lib/lifecycle.ts`：SIGTERM/SIGHUP/uncaughtException/unhandledRejection 兜底，幂等调用 `shutdownShells()`；headless 同时响应 SIGTERM/SIGHUP 中止当前 run。

## 9. 配置、信任、技能

- `config/store.ts`：`config.json` stat 指纹缓存（mtime/size/ctime）；save/verify 显式失效；auth v1/v2 → provider 级 v3 迁移；`config.egress` 默认 `enabled:false + mode:"audit"`；`config.shellPoolSize` 默认 2，TUI/headless 启动时应用到 resident 池；read limits 见 `CONFIGURATION.md`。
- `config/trust.ts`：项目 realpath + tool approval（catalogHash 绑定）；原子写；`fastcode trust --forget <key>`。
- `skills/manager.ts`：技能目录 sha256 manifest；漂移禁用；`/skills verify --confirm` 重新基线；默认 registry 为空。
- `lib/diagnostics.ts`：doctor 输出平台、TMPDIR、内存、auth、session、guard、egress、read limits、缓存、协议、skills；shell pool 行显示 `active · resident/<maxPool> · spawns`（active 含 resident + one-shot，pool 只算 resident）；`doctor --net` 额外探测 registry 连通性。

## 10. 构建与发布

- `npm run build` = `tsc -p tsconfig.build.json` + `node scripts/build.mjs`。
- `node scripts/verify-artifacts.mjs` 检查 `dist/cli.js` / `dist/agent/guards.js` 的运行时字符串标记；`node scripts/bench.mjs` 记录冷启动/写入/读取/list/grep 基准。两者文件已入库，但 `package.json` 尚未注册 `verify:artifacts` / `bench` 脚本。
- `src/cli-main.ts` 不再叫 `cli.ts`，避免 tsc 输出覆盖 `dist/cli.js` bundle。
- esbuild 输出自包含 `dist/cli.js`；`highlight.js` 裁剪为常用语言子集；`bash-parser` 纯 JS。
- 便携包必须包含 `bash-parser` 依赖闭包，否则真机 smoke 直接加载 dist 模块会失败。
- 发布态已知缺口：`package.json.files` 不含 `scripts/`，`npm test` 指向 `../scripts/smoke-test.mjs`；发布前需纳入打包或改测试入口。`.github/workflows/release.yml` 只在 tag/手动触发，PR 门禁尚未新增。
- 当前工作树 = **0.1.8-beta.0**（基于 tag `v0.1.7` / `be6e604` + 2026-11-09 修复）；已本地 `npm run build` + `sh scripts/build-portable.sh`，`release/` 为 0.1.8-beta.0 资产。npm registry 2026-11-09 仍为 0.1.6/0.1.6-beta，尚未发布。
- 不提交/发布本工作树的改动，除非用户明确授权。

## 11. 安全边界

- 这是应用层防手滑 + 可回滚，不是内核级访问控制。
- 不能拦截 FastCode 之外的手工命令、静态二进制、直接 syscall、运行时变量展开、shell function/alias、动态生成命令、行为级反弹 shell。
- Hard Block / Soft Gate / AST 的覆盖与限制以 `RUNBOOK.md` 和方案 §4 为准。

## 12. 验证与维护

```text
npm run typecheck
npm run lint
npm run build
node scripts/smoke-test.mjs   # 或在 package/ 下 npm test
node package/scripts/verify-artifacts.mjs
node package/scripts/bench.mjs
git diff --check
```

当前基线（2026-11-09 复核；PC 为当日复跑，Termux 为 2026-11-06 真机记录）：

- PC：**282/282**（0.1.8-beta.0 本地 build；Windows；POSIX 专属用例跳过）
- Termux 真机：281/281（历史；2026-11-06 tag 前记录；0.1.8-beta.0 新增用例待复跑）
- bench（Windows / Node v24.20.0）：cold start 143.74ms、write 200KB 8.86ms、read_many 10×200KB 26.04ms、list 1000 68.19ms、grep 1000 630.06ms
- bench（Termux / Node v26.4.0）：cold start 893.13ms、write 200KB 32.78ms、read_many 10×200KB 82.57ms、list 1000 153.18ms、grep 1000 865.73ms
- 回滚演练：`git archive HEAD` 临时目录中的旧 bundle 可启动（`--version` 正常）
- 0.1.8-beta.0 新增审批 feedback、压缩/投影、`/threads` 等 smoke 用例已随本地 build 运行；Windows 计数为 282。Termux 真机计数待复跑。

改 `src` 后必须重新 build 并提交新的 `dist`；仓库内文档以本文件、`MODULES.md`、`CONFIGURATION.md` 与两份 README 为准。离线开发文档归档在 `config/kai`，不上传。
