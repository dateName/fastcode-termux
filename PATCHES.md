# FastCode 0.1.3 → 0.1.6 修复清单

基线：npm 包 @simplelittledev/fastcode 0.1.3（本项目 package/ 内的已编译产物）。
由于上游源码仓库已删除，以下修改直接作用于 package/dist 下的编译 JS，未重建源码。

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 1 | bin/fastcode.mjs | await import(绝对路径) 在 Windows 上抛出 ERR_UNSUPPORTED_ESM_URL_SCHEME，启动即失败 | 改用 pathToFileURL(...).href（dist 与 src 两个分支） |
| 2 | dist/index.js | Ink 默认 exitOnCtrlC 为 true，单按 Ctrl+C 直接退出，App 里的“再按一次退出”永远不触发 | render(..., { exitOnCtrlC: false }) 交由应用处理 |
| 3 | dist/lib/http.js | SSE 分帧只识别 LF 空行，遇到 CRLF 空行（含跨 chunk 情况）无法切分，流式回复会粘连或卡住 | 先把缓冲区 CRLF/CR 归一化为 LF，再按空行分帧 |
| 4 | dist/app.js | 斜杠命令回显原始输入，/login 会把 API Key 明文写进对话 | login 的参数回显打码为 ******** |
| 5 | dist/lib/platform.js | Termux 判断要求 PREFIX 目录存在，部分环境误判为非 Termux，导致不启用稳定 UI | 同时识别 TERMUX_VERSION，不再强制目录存在 |
| 6 | dist/app.js | runSlash 的 useCallback 依赖数组缺少 agentMode、enabledPlugins、skillsRegistry，斜杠命令读到过期状态 | 补齐依赖项 |
| 7 | dist/lib/diagnostics.js、dist/cli.js | 缺少部署自检与更新入口 | 新增 fastcode doctor 和 fastcode update |
| 8 | package.json | 版本号 | 0.1.3 → 0.1.6 |
| 9 | dist/agent/tools.js | walk() 对每个条目 stat()（跟随软链接），悬空软链接抛 ENOENT 使 grep / list_files 整次失败；且会经软链接扫出沙箱（如 Termux /storage/emulated/0） | stat/readdir/visit 逐项容错；有效软链接仍遍历；越出沙箱根的软链接不深入；按祖先链检测软链接环；5000 条上限 |
| 10 | dist/providers/openaiCompatible.js | 新版模型（o 系列 / GPT-5+）拒绝 max_tokens 与 temperature，请求 400，表现为“无法识别最新主流模型” | 首次请求失败且报参数错误时，自动用 max_completion_tokens 且不带 temperature 重试一次 |
| 11 | dist/providers/openaiCompatible.js | /models 实时列表只返回 id，丢失标签与价格；且内置列表不全会盖掉实时结果 | 实时列表与内置元数据合并，内置未返回的模型保留 |
| 12 | dist/providers/*、providers/index.js | 仅 8 个服务商，模型清单陈旧 | 新增 xAI(Grok)、Moonshot(Kimi)、Zhipu(GLM)、Qwen(DashScope)、Custom(OpenAI 兼容)；刷新各服务商默认模型 |
| 13 | dist/cli.js、dist/lib/diagnostics.js | Termux 下不想开 TUI 只想改配置；config 与 key 的分离不够直观 | 新增 fastcode provider / model / config 子命令，直接读写 config.json 且绝不触碰 auth.json；doctor 分别打印 config 文件与 keys 文件路径 |
| 14 | docs/*、scripts/*、release/ | 缺架构文档、缺免安装部署方式、缺可复现的构建与自检 | 新增 docs/ARCHITECTURE、MODULES、CONFIGURATION、DEPLOYMENT；新增 scripts/build-portable.sh（一键出行便携包）与 scripts/smoke-test.mjs（10 项自检全部通过）；产出免安装便携包 tar.gz/zip |
| 15 | src/*、tsconfig.json | 只有编译产物，无法维护、审计与升级 | 由 dist 逆向重建 58 个模块到 src/*.ts，types.ts 恢复真实接口；新增 tsconfig.json；tsc 编译零错误，dist 改由 src 生成 |
| 16 | src/agent/tools.ts、scripts/smoke-test.mjs | 沙箱可经软链接逃逸（高危）：沙箱内软链接指向外部时 read/write/delete 可越界 | sandboxPath 增加真实路径校验（解析最深已存在祖先再比对）；smoke 增加软链接越界与越界写入用例 |
| 17 | docs/AUDIT.md | 缺少安全与健壮性审计记录 | 新增审计报告：1 高危已修、2 中危已修、2 中危与 4 低危待办，含复现与建议 |
| 18 | src/agent/tools.ts、docs/CONFIGURATION.md | 沙箱过严：Termux 下无法访问 ~/storage/shared，手机上的项目/下载用不了 | 引入“允许根目录”：Termux 默认放行 ~/storage/shared，支持 FASTCODE_ALLOW_PATHS 扩展、FASTCODE_ALLOW_SHARED_STORAGE=0 关闭；判定以真实路径为准 |
| 19 | src/agent/limits.ts、src/agent/tools.ts、src/agent/protocol.ts | 工具输出上限散落多处（shell 20000、fence 12000、列表 1000 行），且是事后 slice，内存不受控 | 新增统一的 OutputBuffer：边产边截断、head/tail 两种模式、明确标注省略量；一个上限贯穿 shell、grep、list_files、结果封装，可用 FASTCODE_TOOL_OUTPUT_LIMIT 调整 |
| 20 | src/session/log.ts、src/app.ts、src/cli.ts | 会话只在内存，崩溃即全丢 | JSONL 逐行追加落盘到 ~/.fastcode/sessions，新增 fastcode sessions/resume 与 TUI 恢复；缓存上限默认 64MB，可用 FASTCODE_SESSION_CACHE_MB 调整，超出先删最旧 |
| 21 | src/config/trust.ts、src/ui/TrustGate.ts、src/cli.ts | 在陌生目录直接启用 agent 工具，无确认 | 项目信任机制：首次进入目录弹出确认，信任列表存 ~/.fastcode/trusted.json，新增 fastcode trust/untrust/trusted，FASTCODE_TRUST_ALL=1 可跳过 |
| 22 | src/agent/guards.ts、src/agent/tools.ts | shell 工具可执行任意破坏性命令 | 移植 HKUDS/FastCode nanobot 的危险命令 deny 列表（rm -rf / del /f / rmdir /s / format|mkfs|diskpart / dd if= / 写 /dev/sd / shutdown|reboot|poweroff / fork bomb），执行前拦截；支持 allowlist、追加规则与 FASTCODE_ALLOW_DANGEROUS 放行 |

## 验证方式

- 语法：package/dist 下全部 JS 通过 node --check（无语法错误）。
- 单元测试（直接在 Node 中 import 模块）：
  - SSE：CRLF 帧、CRLF 跨 chunk、LF 帧、末尾无空行，均正确产出事件。
  - Termux：设置 TERMUX_VERSION 或 PREFIX 含 com.termux 时识别为 termux，并自动启用稳定 UI。
  - Agent 工具：write_file / read_file / grep / list_files 正常；越界路径 ../.. 被沙箱拒绝。
  - 协议与技能：fastcode_tool 调用解析、SKILL.md frontmatter 解析正确。
- walk 容错：用真实软链接构造悬空链接、有效链接、越界链接与环形链接，grep/list_files 均 ok=true，
  悬空链接被跳过，越界链接不深入（未进入 C:/Windows），环形链接不死循环（6ms 结束）。
- 模型方言：本地 HTTP 服务先对 max_tokens/temperature 返回 400，再接受 max_completion_tokens，
  客户端自动重试并成功流式返回；首个请求成功时不会重试（仅 1 次请求）。
- 端到端：pnpm 安装依赖后，用 ink-testing-library 无头渲染 App：
  - 欢迎语正常显示；
  - 输入 /help 能看到命令列表（19 条）；
  - 输入 /login anthropic sk-SECRET-123 后，最终画面不含明文 Key，且显示打码。
- CLI：--version 输出 0.1.4；skills list / skills search 正常；doctor 输出诊断；update 输出版本对比。

## 本地复现（需要 Node.js >= 18.17）

    cd package
    npm install
    node bin/fastcode.mjs doctor
    node bin/fastcode.mjs update

## 尚未处理 / 已知限制

- 上游源码缺失，无法重新生成 dist；后续若要改功能，建议先反编译或重建 TypeScript 源码树。
- 技能市场 skillshub.wtf 需要付费，属上游问题，未改。
- 未做真实 Termux 设备上的交互测试（本环境无法运行 Android/Termux）。
