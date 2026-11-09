# 模块职责表

一行一个模块。依赖列只列项目内相对依赖（不含 node 内置与第三方包）。
源码在 `package/src/`，`package/dist/` 是构建产物，不要直接改。

## bin 与入口

| 文件 | 职责 | 依赖 |
|---|---|---|
| bin/fastcode.mjs | 优先 import 自包含 `dist/cli.js`，回退 `dist/index.js` / `src/index.ts`；缺依赖时打印修复指引 | dist/cli.js, dist/index.js, src/index.ts |
| src/index.ts | 调用 CLI，非 TUI 子命令直接返回；否则检查 TTY 后加载 Ink/React/App | cli, ink, react, app |
| src/cli-main.ts | 参数解析；provider/model/config/sessions/resume/trust/skills/doctor/update（改名避免 tsc 产物覆盖 dist/cli.js bundle） | skills, store, paths, providers, diagnostics, session/log, session/projection |

## 界面层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/app.ts | TUI 主组件：消费 runner 事件、transcript、输入/选择器、斜杠命令分发；统一 provider → model → key 配置流程并暂存至确认；审批 feedback 文本等待与 Esc 取消 | runner, session, commands, providers, config/store, ui |
| src/ui/Banner.ts | 启动横幅（稳定 UI 下不动画） | 无 |
| src/ui/Message.ts | 消息气泡；Markdown 渲染缓存（不 memo，避免终端 resize 后宽度不更新） | lib/markdown |
| src/ui/Prompt.ts | 输入框与斜杠自动补全；`showCursor` 常开 | ink-text-input, commands/index |
| src/ui/Spinner.ts | 思考动画（stable 模式低频） | 无 |
| src/ui/Picker.ts | 模型/服务商/effort 选择器 | 无 |
| src/ui/StatusBar.ts | 服务商/模型/用量/effort/平台；compact 布局 effort 只渲染一次 | lib/platform |
| src/ui/TrustGate.ts | 首次信任确认 | ink |

## 编排层

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/agent/runner.ts | 纯 async generator：压缩、预算、协议选择、工具执行、loop detection、checkpoint、abort | stream, registry, guards, compaction, model-meta, net, tools |
| src/agent/registry.ts | 工具注册表；startup 契约断言；prepare → egress → approve → execute；toolCatalogHash | config/trust, guards, tools/index, policy/egress |
| src/agent/policy/egress.ts | 纯 egress 策略：敏感路径/内容标记/预算；audit/block/off；denyPaths/denyGlobs；registry 出口判定 | guards, tools/types |
| src/agent/policy/defaults.ts | egress 默认值/类型；供 config/store 使用，避免加载 guards | 无 |

## 领域层：agent / 工具

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/agent/tools.ts | 兼容门面：re-export registry/runAgentTool/类型 | registry |
| src/agent/tools/index.ts | 15 个工具注册 | 各工具 |
| src/agent/tools/types.ts | Tool/ToolCtx/ToolResult/StateScope/Revalidate/SideEffects/ToolErrorCode；结构化 code/hint/truncated/行字节统计 | 无 |
| src/agent/tools/paths.ts | sandboxPath、allowedRoots、realpathOf、sharedDirs | config/store, lib/platform |
| src/agent/tools/readers.ts | read/list/grep/walk；行区间读取、read_many 总预算、grep glob/context/maxResults、读取上限 | ignore, limits |
| src/agent/tools/validate.ts | 参数校验与 preparePath | paths |
| src/agent/tools/shell.ts | shell 工具 + 后台 session 轮询 | shell-session |
| src/agent/tools/apply_patch.ts | 调用 patch 三阶段；review pending 时 fail closed | patch/* |
| src/agent/tools/{read_file,read_many,write_file,append_file,copy_file,delete_file,list_files,make_dir,move_path,grep,replace_in_file,stat_path,pwd}.ts | 单工具实现；声明 stateScope/revalidate；结构化错误码与 sideEffects；read_file offset/limit、read_many 预算、grep 过滤、replace 计数、copy overwrite、delete recursive、move EXDEV 回退 | paths/readers/validate |
| src/agent/protocol.ts | `<fastcode_tool>`/DSML 解析与剥离；formatToolResults；AGENT_SYSTEM_PROMPT | 无 |
| src/agent/protocol-mode.ts | legacy/native/auto 选择；能力缓存；400 降级判定 | model-meta |
| src/agent/tool-schemas.ts | 原生 function-calling JSON schema（15 工具） | types |
| src/agent/guards.ts | 三态危险命令判定；Hard Block/Soft Gate；只读/副作用判定；指纹归一化；FASTCODE_LOOP_EXEMPT | shell-ast |
| src/agent/shell-ast.ts | 纯 JS `bash-parser` 第二意见；只做 hard 升级；`-c`/`find -exec`/`eval/source/.`/同段赋值 | bash-parser |
| src/agent/approval.ts | ApprovalRequest/Decision、稳定 option id、默认选项、plain 编号解析；feedback 必须有用户文本，否则 fail-closed | 无 |
| src/agent/approval-store.ts | once/session/always 作用域；session 内存；always 绑 catalogHash | approval, trust, guards |
| src/agent/approval-native.ts | termux-dialog sheet resolver；feedback 用 termux-dialog text 收集原因；code/index 严格映射，缺失/超时回落 | approval |
| src/agent/approval-json.ts | NDJSON gate:ask/decision schema、版本与错 id/畸形校验；feedback 要求 input 并回传用户文本 | approval |
| src/headless.ts | `--ui json` / 非 TTY plain 的无线程 TUI 运行器；NDJSON v/seq/ts、tool_call/tool_result、egress_denied、notice（plain 写 stderr） | runner, providers, approval-json |
| src/agent/limits.ts | 边产边截断的工具输出缓冲 | 无 |
| src/agent/stream.ts | runStream：idle 超时、retryStream、incomplete、toolCalls | lib/net, types |
| src/agent/context.ts | 旧版字符压缩（兼容保留） | types |
| src/agent/compaction.ts | token 阈值 / heap 强制压缩；摘要落盘与旧文件清理；Notes/Outcomes 优先与 limit marker；server-aware 互斥 | model-meta, config/paths |
| src/agent/process-tree.ts | POSIX 进程组 kill；Windows taskkill /T | 无 |
| src/agent/shell-session.ts | 两条路径：resident `sh -s` 池（默认 2，`/threads` ≤6，子 shell 隔离、池满排队）与 one-shot（`FASTCODE_MAX_SPAWN_PER_TURN` 预算、满额立即失败）；后台输出隔离、`shutdownShellsAsync`、增量轮询、/jobs /kill 数据源 | process-tree |
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
| src/session/log.ts | append-only 事实流；seq；checkpoint；close(reason/compaction) + session_end/projection + best-effort fsync；fsync 分层；未闭合扫描；剪枝前摘要 | config/paths |
| src/session/projection.ts | 事实→消息；fold 工具载荷、cleared 重置、未配对 tool_call 补全；投影约 200KB；dropped marker；fingerprint；resume | session/log, agent/registry, agent/protocol |

## 领域层：服务商

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/providers/index.ts | PROVIDERS 注册与 probe | 各 provider |
| src/providers/spec.ts | URL 模板、pathParams/query、auth 头纯函数；占位符缺失抛错 | 无 |
| src/providers/openaiCompatible.ts | chat/completions 流；URL/头经 spec 参数化；方言重试；tool_calls 归并；idempotency-key | lib/http, lib/native-tools, spec |
| src/providers/anthropic.ts | Claude Messages API（伪协议工具） | lib/http |
| src/providers/{openai,google,deepseek,openrouter,groq,mistral,xai,moonshot,zhipu,qwen,ollama,custom}.ts | 13 provider 配置 | openaiCompatible |

## 领域层：命令（31 个）

| 文件 | 职责 |
|---|---|
| src/commands/index.ts | COMMANDS、findCommand、parseSlash |
| about / cwd / clear / exit / help / config / cost / system / theme / reset | 基本信息与配置 |
| agent / tools | agent 模式与工具说明 |
| model / provider | 统一配置向导入口与参数快捷切换 |
| effort | 思考强度 |
| login / logout / whoami | Key 配置向导入口、provider 级 Key 绑定/登出/状态 |
| skills / plugin | 技能与插件 |
| context | token/阈值/heap |
| cancel / steer / bg / attach / expand / edit | 运行中控制、后台与输入绕行 |
| jobs / kill | 后台 shell 会话 |
| threads (pool) | 查看/调整 resident shell 并发（默认 2，上限 6；不影响 one-shot 路径） |
| compact | 强制本地压缩 |

## 领域层：技能与插件

| 文件 | 职责 | 依赖 |
|---|---|---|
| src/skills/manager.ts | 技能列表/安装/卸载/提示拼装；目录 sha256 完整性校验与重新基线 | config/paths, lib/http, skills/parser, node:crypto |
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
| src/lib/lifecycle.ts | SIGTERM/SIGHUP + fatal 兜底；shutdownShells 幂等清理 | agent/shell-session |
| src/lib/native-tools.ts | tool_calls index 归并与 finalize | types |
| src/lib/model-meta.ts | 13 provider 元数据；用户覆盖；estTokens | 无 |
| src/lib/markdown.ts | Markdown → ANSI；常用语言高亮，冷门语言纯文本回退 + 轻提示 | marked, marked-terminal, highlight-subset |
| src/lib/highlight-subset.ts | 仅注册常用 highlight.js 语言；供 esbuild 别名与回退判定共用 | highlight.js/lib/core + languages |
| src/lib/platform.ts | Termux/OS 识别 | 无 |
| src/lib/uiMode.ts | 稳定 UI / live streaming 判定 | platform |
| src/lib/startup.ts | 欢迎语/缺 Key 提示 | store, providers |
| src/lib/diagnostics.ts | doctor：平台/权限/内存/TMPDIR/SSE/池/协议/未闭合 | 多个模块 |
| src/lib/pkg.ts | 读取 package.json 版本 | 无 |

## 构建与分发

| 文件 | 职责 |
|---|---|
| package/scripts/build.mjs | esbuild：src/index.ts → dist/cli.js（自包含） |
| package/scripts/esbuild-plugins.mjs | 字体内联、require 垫片、桩依赖、highlight.js 常用语言裁剪 |
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
