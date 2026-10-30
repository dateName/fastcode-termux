# FastCode 架构说明

> 版本：0.1.7-beta（Windows 工作副本，2026-10-30）
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
│         agent/registry.ts + tools/*（工具契约与执行）        │
├─────────────────────────────────────────────────────────────┤
│ 领域层  providers/*  session/*  skills/*  plugins/*          │
│         agent/guards.ts  agent/shell-ast.ts  approval*.ts    │
├─────────────────────────────────────────────────────────────┤
│ 基础层  config/*  lib/*  patch/*  types.ts                   │
└─────────────────────────────────────────────────────────────┘
```

原则：

- `agent/runner.ts` 不依赖 React；UI 只消费事件。
- 工具执行统一经过 `ToolRegistry`：prepare → approve → execute。
- Hard Block 在 `guards.ts`，AST 只做第二意见；审批在 `approval*`，不反向改 guard 结论。
- 事实流 append-only；投影可重建；剪枝后仍保留带 manifest 的可验证投影。

## 2. 入口与命令

- `bin/fastcode.mjs`：优先加载自包含 `dist/cli.js`，回退 `dist/index.js` / `src/index.ts`。
- `src/index.ts`：调用 CLI；`--ui json` 走 headless，非 TTY 的 plain 走 headless，其余加载 Ink TUI。
- `src/cli-main.ts`：meow 参数解析；provider/model/config/sessions/resume/trust/skills/doctor/update、`--ui`。
- `src/commands/*`：斜杠命令纯函数；`/provider`、`/model`、`/login` 无参数统一进入 app 的模型配置向导。
- `src/headless.ts`：无 Ink 运行器；stdout 只输出 NDJSON 协议/回答，诊断写 stderr。

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
- Hard Block 不生成审批请求，不显示 Allow/Always/Force。

## 4. Agent 与工具

- `agent/runner.ts`：单轮/多轮、流式、工具调用、预算、loop detection、compaction、checkpoint、resume 历史。
- `agent/registry.ts`：
  - `stateScope` / `revalidate` 契约断言；
  - shell Soft Gate → `pending` ApprovalRequest；
  - Hard Block 直接 deny；
  - resolver 返回 allow/deny/feedback；无 resolver 或异常 fail-closed；
  - once/session/always 授权经 `approval-store`；always 写入 trust 并绑定 catalogHash。
- `agent/tools/*`：15 个单文件工具；文件工具走沙箱路径；patch 三阶段 parse/plan/apply。
- `agent/protocol.ts`：`<fastcode_tool>` JSON 与 DSML 双方言；解析器返回 `{calls, consumedEnd, errors}`；残留标签抢救与重复解析防护。
- `agent/shell-ast.ts`：纯 JS `bash-parser` 第二意见，只升级 hard；只解析 `-c`、`find -exec`、`eval/source/.`、同段一次赋值；解析失败保持形状结果。

## 5. Guardrails

- `agent/guards.ts` 三态：`allow` / `soft_gate` / `hard_block`。
- Hard Block 包括：根/当前/父/home/变量/通配符/系统路径递归删除、源码目录递归删除、`find -delete`、force-push 受保护分支、`git clean -fdx`、`dd of=/dev/*`、mkfs/mke2fs/fdisk/diskpart/format、docker prune/全删、`kubectl delete --all namespaces`、`chmod/chown -R` 根或系统路径、shutdown/reboot/poweroff/systemctl stop、`.pem`/`*.key`/`auth.json`/sessions 删除/清空、`.env` 截断/单 `>` 覆盖/shred、`curl|sh`、`base64 -d|sh`、定向 credential grep/外发、非字面量 eval/source/-c、`nc -e`、`/dev/tcp`。
- Soft Gate：普通文件/可重建目录删除、`.env` 删除/移动、`git reset --hard`、`git clean -fd`、feature force-push、普通 `kubectl` ns/scale、普通 truncate/shred、裸 `printenv`/`env`。
- `FASTCODE_ALLOW_DANGEROUS=1` 只绕过 Soft Gate，不能绕过 Hard Block。
- AST 只做升级，不降级；解析失败保持形状匹配结果。

## 6. 会话与恢复

- `session/log.ts`：append-only JSONL；`session_start` / `user` / `assistant_raw` / `tool_call` / `tool_result` / `checkpoint` / `compacted` / `session_end`。
- close/剪枝前写 projection；`.projection.json` 保存 manifest：
  - `contentHash`：投影内容 sha256
  - `sessionHash`：源事实 sha256
  - `lastFactSeq`：覆盖的最高事实序号
- `session/projection.ts`：恢复先校验 manifest，再校验 fingerprint；事实晚于投影则重建；剪枝后只使用校验通过的投影；tool_call/tool_result 配对修复。
- 剪枝保留投影，删除原始 JSONL；旧格式/无 manifest 投影明确告警，不静默返回空会话。

## 7. Provider、流与压缩

- `providers/*`：13 个 provider；`authEnv` 是 provider 级密钥候选；`capabilities.toolCalling` 缓存 native/pseudo。
- `lib/http.ts`：SSE 解析、UTF-8 单字节拼接、idle timeout `NetworkStallError`、连通性探测。
- `lib/net.ts`：retryRequest / retryStream，前缀去重，`QuotaError`。
- `agent/compaction.ts`：token 阈值、heap 强制、server-aware 互斥、summary 落盘。
- `lib/model-meta.ts`：上下文窗口 / charsPerToken / supportsTools；用户可覆盖。

## 8. Shell 与进程树

- `agent/shell-session.ts`：resident `sh -s` 池（≤2）、2s 转后台、增量输出、`/jobs` `/attach` `/kill`。
- 超时/取消统一 `terminateProcessTree`：进程组 `SIGTERM` → grace → `SIGKILL`；ESRCH 视为已退出。
- 后台任务保留 timeout；转后台只解除前台 AbortSignal。
- `setsid` 后代仍可能逃逸；不扫描 `ppid=1`，错误信息明确边界。

## 9. 配置、信任、技能

- `config/store.ts`：`config.json` stat 指纹缓存（mtime/size/ctime）；save/verify 显式失效；auth v1/v2 → provider 级 v3 迁移。
- `config/trust.ts`：项目 realpath + tool approval（catalogHash 绑定）；原子写；`fastcode trust --forget <key>`。
- `skills/manager.ts`：技能目录 sha256 manifest；漂移禁用；`/skills verify --confirm` 重新基线；默认 registry 为空。
- `lib/diagnostics.ts`：doctor 输出平台、TMPDIR、内存、auth、session、guard、缓存、协议、skills。

## 10. 构建与发布

- `npm run build` = `tsc -p tsconfig.build.json` + `node scripts/build.mjs`。
- `src/cli-main.ts` 不再叫 `cli.ts`，避免 tsc 输出覆盖 `dist/cli.js` bundle。
- esbuild 输出自包含 `dist/cli.js`；`highlight.js` 裁剪为常用语言子集；`bash-parser` 纯 JS。
- 便携包必须包含 `bash-parser` 依赖闭包，否则真机 smoke 直接加载 dist 模块会失败。
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
node scripts/smoke-test.mjs
git diff --check
```

当前基线（2026-10-30）：

- PC：207/207
- Termux 真机：212/212（含 POSIX 专属 #4/#50/#51/#54）

改 `src` 后必须重新 build 并提交新的 `dist`；仓库内文档以本文件、`MODULES.md`、`CONFIGURATION.md` 与两份 README 为准。离线开发文档归档在 `config/kai`，不上传。
