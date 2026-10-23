# FastCode 架构说明（Termux 优先）

本文描述 FastCode 0.1.6-beta 的分层、数据流、扩展点与 Termux 适配位置。
目标：只看这一篇，就知道该改哪个文件、会影响哪些模块。

## 1. 分层总览

    +--------------------------------------------------------------+
    | 入口层   bin/fastcode.mjs -> dist/cli.js（esbuild 自包含）    |
    |                           -> dist/index.js（tsc 回退）        |
    +--------------------------------------------------------------+
    | 命令层   cli.ts（TUI 之外）+ commands/*（TUI 斜杠命令）      |
    +--------------------------------------------------------------+
    | 界面层   app.ts + ui/*（Ink/React；只渲染事件，不跑 agent）   |
    +--------------------------------------------------------------+
    | 编排层   agent/runner.ts（纯 async generator，无 React）      |
    +--------------------------------------------------------------+
    | 领域层   agent/*（工具/协议/压缩/patches/shell）              |
    |          providers/*、session/*、skills/*、plugins/*          |
    +--------------------------------------------------------------+
    | 基础层   config/*、lib/*、patch/*                             |
    +--------------------------------------------------------------+

依赖方向：上层依赖下层。`agent/runner.ts` 不依赖 Ink/React；
`ui` 只消费 runner 事件，不直接执行工具。唯一共享较广的是 `providers/` 与 `config/`。

## 2. 模块清单（src/ 114 个 TS 模块；dist 为编译产物 + 自包含 dist/cli.js）

    bin/                    启动壳：优先 dist/cli.js，回退 dist/index.js / src
    dist/cli.js             自包含单文件（运行产物），也是 CLI 入口
    dist/index.js           tsc 回退入口：先跑 CLI，再决定是否进入 TUI
    dist/app.ts             TUI 主组件：事件消费、Transcript、输入/选择器、斜杠命令
    dist/ui/                Banner/Message/Prompt/Spinner/Picker/StatusBar/TrustGate
    dist/commands/          30 个斜杠命令（含 /jobs /kill /cancel /steer /attach /compact /expand /edit）
    dist/providers/         13 个服务商 + 共享 OpenAI 兼容实现
    dist/agent/             runner、registry、tools/、protocol、protocol-mode、guards、limits、
                            stream、context、compaction、approval、shell-session、process-tree
    dist/patch/             parse → plan → apply（事务式多文件补丁）
    dist/session/           log（事实流）、projection（工作集投影/resume）
    dist/skills/            SKILL.md 发现、解析、安装
    dist/plugins/           插件包发现与提示拼装
    dist/config/            paths、store（config/auth/capabilities）、trust、themes
    dist/lib/               http、net、native-tools、model-meta、markdown、platform、uiMode、
                            startup、diagnostics、pkg

    仓库根：
    package/scripts/        build.mjs（esbuild）、esbuild-plugins.mjs
    scripts/                install.sh、build-portable.sh、update-termux.sh、smoke-test.mjs
    .github/workflows/      release.yml（v* tag 自动构建 Release + npm publish）

每个文件的职责见 `docs/MODULES.md`。

## 3. 启动与运行数据流

### 3.1 冷启动

    1) bin/fastcode.mjs 解析自身路径 → 优先 import dist/cli.js，否则 dist/index.js
    2) cli.ts 解析子命令；provider/model/config/sessions/trust/skills/doctor 等直接退出
    3) 否则要求 stdout 是 TTY，加载 Ink/React 与 app.ts
    4) app.ts 读取 config；resume 时调用 session/projection 恢复消息/cwd/provider/model
    5) 渲染 TrustGate（需要时）与主界面

### 3.2 一次聊天（agentMode 打开）

    用户输入
      -> app.handleSubmit
      -> runAgent()（agent/runner.ts）
           - 压缩：超过 model-meta 阈值或 heap 水位时本地压缩，摘要写 summary-*.md
           - 预算：tokenBudget / costBudgetUsd，耗尽保留已生成文本
           - runStream -> streamSSE（25s idle 默认，可用 FASTCODE_SSE_IDLE_MS 调大）
           - lib/net：request/stream 重试；公共前缀去重；clientRequestId
           - 协议：legacy 伪协议 <fastcode_tool> / native tool_calls（auto 时按能力）
           - 工具：registry.prepare → approve → execute
           - 补丁：patch/parse → plan → apply（全量 plan 后才落盘）
           - 每轮 yield checkpoint，activeFiles 从 ToolResult.sideEffects 累积
      -> app 消费事件：更新 transcript/状态栏，写事实流（user/assistant_raw/tool_call/
         tool_result/checkpoint/compacted），tool 输出在稳定 UI 下默认折叠
      -> 完成/中断/预算/循环：done 携带 history 与 finalText

### 3.3 恢复（resume）

    fastcode resume [id|latest]
      -> cli 读取 session_start/checkpoint 的 cwd/provider/model，必要时 chdir
      -> session/projection.resumeSession：
           - 读事实流；最后一条不是 session_end 时提示未闭合
           - 校验 projection.fingerprint（toolCatalogHash + provider::model + cwdDigest +
             compactionSource）；不匹配则从事实流重建
           - 未配对 tool_call 按只读/幂等/非幂等补全
           - native 事实恢复为 assistant.toolCalls + role:"tool" 消息
      -> app 用恢复的 provider/model 覆盖本次运行，显示告警后继续

### 3.4 后台 shell

    shell 命令
      -> agent/shell-session.ts
           - POSIX：最多 2 个常驻 sh -s；命令带唯一结束标记
           - >2s 未完成：返回 sessionId，命令继续在后台
           - 轮询：只返回新输出；退避 1→2→4→30s
           - Windows：独立进程 + taskkill /T
      -> /jobs 列表、/attach 增量、/kill 杀进程树

### 3.5 配置、密钥与能力

    auth.json（provider 级 Key，v3；旧版自动迁移/备份）
    config.json（provider/model/theme/sharedDirs/capabilities…）
    trusted.json（version 1：paths 用 realpath；旧 trusted[] 自动迁移）
    model-meta.json（可选：contextWindow/charsPerToken/supportsTools 覆盖）

能力缓存：`capabilities.toolCalling["provider::model"] = "native" | "pseudo"`。
原生 tools 返回 400 时本次降级伪协议并缓存 pseudo（fail closed）。

### 3.6 分发与打包

    - package/src → tsc → package/dist；esbuild 打包出自包含 dist/cli.js（提交进 Git）
    - clone 后无需 npm install 即可运行（前提是 dist/cli.js 在仓库里）
    - scripts/build-portable.sh 生成 release/ 的 tar.gz/zip、npm pack .tgz、SHA256SUMS
    - .github/workflows/release.yml 在 v* tag 时上传 GitHub Release 并 npm publish

## 4. 扩展点

### 4.1 新增服务商

    1) providers/<id>.ts：id/label/authEnv/baseUrl/defaultModel/listModels/stream
    2) 在 providers/index.ts 注册
    3) 若支持原生 tools：确认 toolCalling 能力与 400 降级路径
    4) docs/CONFIGURATION.md 补环境变量；lib/diagnostics 补诊断

### 4.2 新增斜杠命令

    1) commands/<name>.ts 导出 {name, description, run({args,raw,state,actions})}
    2) commands/index.ts 注册
    3) 返回 {message|quit|picker}；运行中只放行 cancel/steer/jobs/kill/attach/expand/context

### 4.3 新增工具

    1) agent/tools/<name>.ts 实现 Tool：name/stateScope/revalidate/prepare/execute
    2) agent/tools/index.ts 注册
    3) 需要时在 agent/tool-schemas.ts 加原生 schema
    4) 路径走 sandboxPath；副作用返回 sideEffects.touched/removed
    5) 在 docs/CONFIGURATION.md 或工具说明里写限制

### 4.4 技能 / 插件（不改代码）

    技能：~/.fastcode/skills/<name>/SKILL.md
    插件：~/.fastcode/plugins/<name>/PLUGIN.md（可选 skills/）

## 5. Termux / 手机适配点

| 关注点 | 位置 | 行为 |
|---|---|---|
| 平台识别 | lib/platform.ts | TERMUX_VERSION 或 PREFIX 含 com.termux |
| 稳定 UI | lib/uiMode.ts | Termux 默认开启；只降低动画/重绘，不再关闭输入光标 |
| 目录布局 | config/paths.ts | 默认 ~/.fastcode，FASTCODE_HOME 可迁移 |
| 密钥权限 | config/paths.ts lockdown() | auth.json 0600 |
| shell | agent/shell-session.ts | 常驻 sh -s 池 / 独立进程；只杀进程树 |
| 后台长命令 | agent/shell-session.ts | 2s 后转后台；/jobs /attach /kill |
| 进程树 | agent/process-tree.ts | POSIX 进程组；Windows taskkill /T |
| 文件系统 | session/log.ts | /sdcard 上 checkpoint fsync（FASTCODE_FSYNC 可覆盖） |
| 输入 | ui/Prompt.ts | showCursor 常开；/edit 外部编辑器绕开 Ink IME 缺陷 |
| 自检 | lib/diagnostics.ts | doctor 显示平台/权限/内存/TMPDIR/phantom/SSE/池 |

## 5.1 安全与恢复（0.1.6-beta）

| 关注点 | 位置 | 行为 |
|---|---|---|
| 项目信任 | config/trust.ts + ui/TrustGate.ts | v1 paths(realpath)；每个 approve 重读，mtime memo |
| 危险命令 | agent/guards.ts | deny 列表 + allowlist + 工作区限制；只读/副作用分类 |
| 工具契约 | agent/registry.ts | stateScope/revalidate；requiresTrust ⇒ trust 断言 |
| 文本输出 | agent/limits.ts | 边产边截断，head/tail 统一上限 |
| 工具输出折叠 | app.ts | 稳定 UI 默认一行摘要；/expand 展开 |
| 补丁安全 | patch/* | O_NOFOLLOW、lstat、CRLF/mode 保持、全量 plan、符号链接拒绝 |
| 补丁审批 | patch/plan.ts | 敏感/大 diff → pending；没有 resolver 时 fail closed |
| 事实流 | session/log.ts | append-only JSONL；seq；checkpoint；剪枝前写 projection |
| 投影 | session/projection.ts | <20KB；fingerprint 校验；摘要/compactionSource |
| 请求超时/重试 | agent/stream.ts + lib/net.ts | SSE idle + 前缀去重 + QuotaError |
| 压缩 | agent/compaction.ts | token 阈值 / heap 强制；server-aware 互斥 |
| 原生协议 | protocol-mode.ts + providers | tool_calls 归并；400 降级；能力缓存 |
| 中断 | process-tree.ts | SIGTERM → 2s → SIGKILL；输出保留 |

已知限制：

- Ink 5.x 的 IME 光标定位未根治；实测 Termux pty 尺寸异常（129×129）时会出现 `abcdef` → `bcdefa` 和右侧裁切，
  修正 pty（`stty cols/rows`）后基本输入通过。`/edit` 仍是绕行，彻底修需 Ink ≥6.7 + useCursor。
- 进程内仍有 string-width 4.2.3 / 5.1.2 / 7.2.0 三份；未做强制 overrides（CJS/ESM 风险）。
- approval pending 的数字选择 UI/resolver 尚未实现，命中 pending 时 fail closed。
- 原生 tools 仅覆盖 OpenAI 兼容 provider；Anthropic/Google/未知 provider 走伪协议。

## 6. 维护性评估

**可以按文件维护**：入口、命令、界面、编排、领域、基础分层清晰；provider/command/tool 均单文件注册。
`agent/runner.ts` 与 `ui` 解耦后，可在无 React 环境下跑回归（smoke #32–35）。
消息 Markdown 只做内容缓存；不使用 memo，避免 Termux resize 后宽度/换行被旧 props 锁死。

当前较大的文件：`app.ts`（事件消费/输入/命令，~32KB）、`agent/runner.ts`（~20KB）、
`agent/shell-session.ts`（~15KB）、`patch/plan.ts`（~12KB）。后续可把 app 的 transcript/输入/
命令分发拆成 hooks；runner 的工具执行循环可抽成独立模块。

维护方式：改 `src` → `npm run typecheck && npm run lint && npm run build && node scripts/smoke-test.mjs`
→ 提交新的 `dist/cli.js`。**不要直接改 dist。**
