# 模块职责表

一行一个模块。依赖列只列项目内相对依赖（不含 node 内置与第三方包）。
源码在 `package/src/`，`package/dist/` 是构建产物，不要直接改。

## bin 与入口

| 文件 | 职责 | 依赖 |
|---|---|---|
| bin/fastcode.mjs | 优先 import 自包含 `dist/cli.js`，回退 `dist/index.js` / `src/index.ts`；缺依赖时打印修复指引 | dist/cli.js, dist/index.js, src/index.ts |
| src/index.ts | 调用 CLI，非 TUI 子命令直接返回；否则检查 TTY 后加载 Ink/React/App | cli, ink, react, app |
| src/cli.ts | 参数解析；provider/model/config/sessions/resume/trust/skills/doctor/update | skills, store, paths, providers, diagnostics, session/log, session/projection |

## 界面层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/app.ts | TUI 主组件：消费 runner 事件、transcript、输入/选择器、斜杠命令分发、checkpoint/事实流落盘 | runner, session, commands, ui |
| src/ui/Banner.ts | 启动横幅（稳定 UI 下不动画） | 无 |
| src/ui/Message.ts | 消息气泡；Markdown 缓存 + React.memo | lib/markdown |
| src/ui/Prompt.ts | 输入框与斜杠自动补全；`showCursor` 常开 | ink-text-input, commands/index |
| src/ui/Spinner.ts | 思考动画（stable 模式低频） | 无 |
| src/ui/Picker.ts | 模型/服务商/effort 选择器 | 无 |
| src/ui/StatusBar.ts | 服务商/模型/用量/effort/平台 | lib/platform |
| src/ui/TrustGate.ts | 首次信任确认 | ink |

## 编排层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/agent/runner.ts | 纯 async generator：压缩、预算、协议选择、工具执行、loop detection、checkpoint、abort | stream, registry, guards, compaction, model-meta, net, tools |
| src/agent/registry.ts | 工具注册表；startup 契约断言；prepare → approve → execute；toolCatalogHash | config/trust, guards, tools/index |

## 领域层：agent / 工具

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/agent/tools.ts | 兼容门面：re-export registry/runAgentTool/类型 | registry |
| src/agent/tools/index.ts | 15 个工具注册 | 各工具 |
| src/agent/tools/types.ts | Tool/ToolCtx/ToolResult/StateScope/Revalidate/SideEffects | 无 |
| src/agent/tools/paths.ts | sandboxPath、allowedRoots、realpathOf、sharedDirs | config/store, lib/platform |
| src/agent/tools/readers.ts | read/list/grep/walk 与读取上限 | ignore, limits |
| src/agent/tools/validate.ts | 参数校验与 preparePath | paths |
| src/agent/tools/shell.ts | shell 工具 + 后台 session 轮询 | shell-session |
| src/agent/tools/apply_patch.ts | 调用 patch 三阶段；review pending 时 fail closed | patch/* |
| src/agent/tools/{read_file,read_many,write_file,append_file,copy_file,delete_file,list_files,make_dir,move_path,grep,replace_in_file,stat_path,pwd}.ts | 单工具实现；声明 stateScope/revalidate；副作用返回 sideEffects | paths/readers/validate |
| src/agent/protocol.ts | `<fastcode_tool>`/DSML 解析与剥离；formatToolResults；AGENT_SYSTEM_PROMPT | 无 |
| src/agent/protocol-mode.ts | legacy/native/auto 选择；能力缓存；400 降级判定 | model-meta |
| src/agent/tool-schemas.ts | 原生 function-calling JSON schema（15 工具） | types |
| src/agent/guards.ts | 危险命令；只读/副作用判定；指纹归一化；FASTCODE_LOOP_EXEMPT | 无 |
| src/agent/limits.ts | 边产边截断的工具输出缓冲 | 无 |
| src/agent/stream.ts | runStream：idle 超时、retryStream、incomplete、toolCalls | lib/net, types |
| src/agent/context.ts | 旧版字符压缩（兼容保留） | types |
| src/agent/compaction.ts | token 阈值 / heap 强制压缩；摘要落盘；server-aware 互斥 | model-meta, config/paths |
| src/agent/approval.ts | ApprovalDecision/Request/Option 类型 | 无 |
| src/agent/process-tree.ts | POSIX 进程组 kill；Windows taskkill /T | 无 |
| src/agent/shell-session.ts | 常驻 sh -s 池、后台 session、增量轮询、/jobs /kill 数据源 | process-tree |
| src/agent/ignore.ts | .fastcodeignore、默认忽略、二进制识别 | 无 |

## 领域层：patch

| 文件 | 职责 |
|---|---|
| src/patch/parse.ts | Begin/End、Add/Delete/Update/Move、hunk 解析 |
| src/patch/plan.ts | 沙箱/符号链接检查、CRLF/mode 记录、三级模糊匹配、per-file diff、review |
| src/patch/apply.ts | tmp+O_NOFOLLOW+fchmod+rename；多文件失败回滚；mode 告警 |

## 领域层：session

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/session/log.ts | append-only 事实流；seq；checkpoint；fsync 分层；未闭合扫描；剪枝前摘要 | config/paths |
| src/session/projection.ts | 事实→消息；未配对 tool_call 补全；投影 <20KB；fingerprint；resume | session/log, agent/registry, agent/protocol |

## 领域层：服务商

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/providers/index.ts | PROVIDERS 注册与 probe | 各 provider |
| src/providers/openaiCompatible.ts | chat/completions 流；方言重试；tool_calls 归并；idempotency-key | lib/http, lib/native-tools |
| src/providers/anthropic.ts | Claude Messages API（伪协议工具） | lib/http |
| src/providers/{openai,google,deepseek,openrouter,groq,mistral,xai,moonshot,zhipu,qwen,ollama,custom}.ts | 13 provider 配置 | openaiCompatible |

## 领域层：命令（30 个）

| 文件 | 职责 |
|---|---|
| src/commands/index.ts | COMMANDS、findCommand、parseSlash |
| about / cwd / clear / exit / help / config / cost / system / theme / reset | 基本信息与配置 |
| agent / tools | agent 模式与工具说明 |
| model / provider | 交互选择器与直接切换 |
| effort | 思考强度 |
| login / logout / whoami | Key 绑定/登出/状态 |
| skills / plugin | 技能与插件 |
| context | token/阈值/heap |
| cancel / steer / bg / attach / expand / edit | 运行中控制、后台与输入绕行 |
| jobs / kill | 后台 shell 会话 |
| compact | 强制本地压缩 |

## 领域层：技能与插件

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/skills/manager.ts | 技能列表/安装/卸载/提示拼装 | config/paths, lib/http, skills/parser |
| src/skills/parser.ts | SKILL.md frontmatter | 无 |
| src/plugins/manager.ts | 插件发现/导入/移除/提示拼装 | config/paths |

## 基础层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/config/paths.ts | 目录布局；FASTCODE_HOME；0600 | lib/platform |
| src/config/store.ts | config/auth/capabilities；provider 级 Key；v1/v2 迁移；原子写 | paths, themes |
| src/config/themes.ts | 配色主题 | 无 |
| src/config/trust.ts | trust v1（paths/tools）；realpath；mtime memo；旧 trusted[] 迁移 | config/paths |
| src/lib/http.ts | fetchJson、streamSSE（CRLF/UTF-8/idle/NetworkStall）、probeConnectivity | 无 |
| src/lib/net.ts | retryRequest、retryStream（前缀去重）、QuotaError | types |
| src/lib/native-tools.ts | tool_calls index 归并与 finalize | types |
| src/lib/model-meta.ts | 13 provider 元数据；用户覆盖；estTokens | 无 |
| src/lib/markdown.ts | Markdown → ANSI | marked, marked-terminal |
| src/lib/platform.ts | Termux/OS 识别 | 无 |
| src/lib/uiMode.ts | 稳定 UI / live streaming 判定 | platform |
| src/lib/startup.ts | 欢迎语/缺 Key 提示 | store, providers |
| src/lib/diagnostics.ts | doctor：平台/权限/内存/TMPDIR/SSE/池/协议/未闭合 | 多个模块 |
| src/lib/pkg.ts | 读取 package.json 版本 | 无 |

## 构建与分发

| 文件 | 职责 |
|---|---|
| package/scripts/build.mjs | esbuild：src/index.ts → dist/cli.js（自包含） |
| package/scripts/esbuild-plugins.mjs | 字体内联、require 垫片、桩依赖 |
| scripts/install.sh / install-termux.sh | 软链 dist/cli.js 到 $PREFIX/bin |
| scripts/build-portable.sh | release/ tar.gz/zip + npm pack + SHA256SUMS |
| scripts/update-termux.sh | 目录/git/npm 更新 |
| scripts/smoke-test.mjs | 回归（PC 115 项；Termux 120 项，含 POSIX-only） |
| .github/workflows/release.yml | v* tag：构建资产、GitHub Release、npm publish |

## 测试与验证

- `npm run typecheck` / `npm run lint` / `npm run build`
- `node scripts/smoke-test.mjs`：110+ 行为断言（runner、预算、循环、工具契约、
  retry/SSE、checkpoint/projection、compaction、patch、shell、native tools、命令、doctor）。
- Termux 真机额外验证：进程组 kill、/sdcard fsync、#50/#51/#54、TUI `/context`、`/edit`。
