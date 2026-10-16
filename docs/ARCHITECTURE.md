# FastCode 架构说明（Termux 优先）

本文描述 FastCode 0.1.4 的整体架构、模块划分、数据流、扩展点与 Termux 适配位置。
目标是：任何人只看这一篇，就能知道改哪个文件、影响哪些模块。

## 1. 分层总览

    +-----------------------------------------------------------+
    | 入口层   bin/fastcode.mjs  ->  dist/index.js              |
    +-----------------------------------------------------------+
    | 命令行层 dist/cli.js  (TUI 之外的所有子命令)              |
    +-----------------------------------------------------------+
    | 界面层   dist/app.js  +  dist/ui/*  (Ink + React)         |
    +-----------------------------------------------------------+
    | 领域层   providers/  agent/  commands/  skills/  plugins/ |
    +-----------------------------------------------------------+
    | 基础层   config/  lib/                                    |
    +-----------------------------------------------------------+

依赖方向：上层依赖下层，下层不反向依赖界面层。
唯一例外：providers/ 被 cli、app、commands、lib/diagnostics 共享。

## 2. 模块清单（58 个 JS，约 121 KB）

    bin/                    启动壳，负责把入口解析成 file URL 后 import
    dist/index.js           入口：先跑 cli，再决定是否进入 TUI
    dist/cli.js             参数解析与全部非交互子命令
    dist/app.js             TUI 主组件：状态、聊天循环、斜杠命令分发
    dist/ui/                展示组件（Banner/Message/Prompt/Spinner/StatusBar）+ TrustGate（首次信任确认）
    dist/commands/          19 个斜杠命令，单文件一个命令
    dist/providers/         13 个服务商 + 共享 OpenAI 兼容实现
    dist/agent/             protocol（工具协议）、tools（工具执行）、limits（输出上限）、guards（危险命令拦截）
    dist/skills/            SKILL.md 发现、解析、安装
    dist/plugins/           插件包发现与拼装
    dist/config/            paths（目录布局）、store（配置与密钥）、trust（项目信任列表）、themes
    dist/lib/               http、markdown、platform、uiMode、startup、diagnostics
    dist/session/           log（JSONL 会话落盘 / 恢复 / 缓存剪枝）
    dist/types.js           共享类型占位

每个文件的职责与依赖见 docs/MODULES.md。

## 3. 启动与运行数据流

### 3.1 冷启动

    1) bin/fastcode.mjs  解析自身路径 -> import dist/index.js
    2) dist/index.js     调 parseCli()
    3) parseCli 命中子命令  -> 执行并退出（不加载 Ink）
    4) 否则要求 stdout 是 TTY，动态 import ink/react/app.js
    5) app.js 读取 config -> 生成欢迎语 -> 渲染界面

### 3.2 一次聊天（agentMode 打开，最多 8 轮工具调用）

    用户输入
      -> app.js handleSubmit
      -> 组装 system = systemPrompt + skills 提示 + plugins 提示 + agent 提示
      -> provider.stream({model, messages, system})
      -> 流式增量写入界面
      -> 模型输出中若含 <fastcode_tool>{...}</fastcode_tool>
           -> parseToolCalls 解析
           -> runAgentTool 在 cwd 沙箱内执行（shell / 读写文件 / grep ...）
           -> formatToolResults 回填为一条 user 消息
           -> 回到 provider.stream 继续下一轮
      -> 无工具调用时结束，把最终文本写入记录

### 3.3 配置与密钥的读取顺序

    环境变量 KEY  ->  先查 auth.json  ->  再查进程环境变量

config.json 与 auth.json 是两个独立文件；改模型只动 config.json。

## 4. 扩展点（怎么加东西）

### 4.1 新增一个服务商

    1) 复制 dist/providers/deepseek.js 为新文件，改 BASE / id / label / authEnv / 模型清单
    2) 在 dist/providers/index.js 里 import 并加入 PROVIDERS 数组
    3) 若不是 OpenAI 兼容协议，参考 anthropic.js 自行实现 stream()
    4) 在 docs/CONFIGURATION.md 补一行环境变量

### 4.2 新增一个斜杠命令

    1) 在 dist/commands/ 新建 <name>.js，导出 { name, description, run({args, raw, state, actions}) }
    2) 在 dist/commands/index.js 的 COMMANDS 数组里注册
    3) run() 返回 { message } 输出文本，返回 { quit: true } 退出

### 4.3 新增一个 agent 工具

    1) dist/agent/tools.js 的 runAgentTool switch 里加分支
    2) dist/agent/protocol.js 的 AGENT_SYSTEM_PROMPT 里加工具说明
    3) 涉及路径的一律走 sandboxPath()，保证不越出沙箱

### 4.4 新增技能 / 插件（不用改代码）

    技能：~/.fastcode/skills/<name>/SKILL.md
    插件：~/.fastcode/plugins/<name>/PLUGIN.md (+ 可选 skills/)

## 5. Termux / 手机适配点

| 关注点 | 位置 | 行为 |
|---|---|---|
| 平台识别 | lib/platform.js | 认 TERMUX_VERSION 或 PREFIX 含 com.termux |
| 界面防闪烁 | lib/uiMode.js | Termux 自动开启稳定 UI（关闭动画） |
| 目录布局 | config/paths.js | 默认 ~/.fastcode，可用 FASTCODE_HOME 覆盖 |
| 密钥权限 | config/paths.js lockdown() | auth.json 设为 0600（Termux 生效） |
| 软链接 | agent/tools.js walk() | 悬空链接跳过；越出沙箱的软链接不深入；防环 |
| shell 执行 | agent/tools.js runShell() | 走 Termux 的 /bin/sh，注入 FASTCODE_SANDBOX 标记 |
| 自检 | lib/diagnostics.js | fastcode doctor 打印 Termux 专属建议 |

## 5.1 安全与恢复（0.1.4）

| 关注点 | 位置 | 行为 |
|---|---|---|
| 项目信任 | config/trust.ts + ui/TrustGate.ts | 首次在陌生目录启用 agent 工具前先确认；列表在 ~/.fastcode/trusted.json |
| 危险命令拦截 | agent/guards.ts | 执行前匹配 deny 列表（移植自 HKUDS/FastCode nanobot）；可加白名单或放行 |
| 输出上限 | agent/limits.ts | OutputBuffer 边产边截断，head/tail 两种模式，一个上限贯穿所有工具 |
| 会话落盘 | session/log.ts | JSONL 逐行追加，崩溃可恢复；缓存上限默认 64MB，超出删最旧 |

数据流补充：App 初始化时按 resume 决定 createSessionLog 还是 openSessionLog；
每条 user/system/assistant 消息立即 append；退出时写 session_end 并剪枝。
shell 工具在 spawn 之前先过 evaluateShellCommand()。

## 6. 维护性评估（结论）

**够模块化，可以按文件维护**，理由：

- 一层一职责：入口、命令、界面、领域、基础互不混杂；
- 插件式结构：每个 provider / command / UI 组件各自一个文件，增删互不影响；
- 依赖方向清晰，没有循环依赖；
- 单文件最大约 320 行（app.js），多数在 20 到 120 行。

**已补齐（0.1.4）：**

1. **已有 TypeScript 源码树 src/**：58 个模块由 dist 逆向重建，types.ts 恢复了真实接口，
   tsc 编译零错误。dist 现在是 src 的编译产物，**源码才是唯一事实来源**。
   构建：cd package && npm install && npm run build
2. **已有自检脚本**：node scripts/smoke-test.mjs（覆盖沙箱越界、SSE 换行、配置与密钥分离等）。
3. **仍偏大的三个文件**建议后续拆分：app.ts、agent/tools.ts、skills/manager.ts。

维护方式：改 src 下对应单文件 -> npm run build -> node scripts/smoke-test.mjs。
**注意：dist 是生成物，不要再直接改 dist。**
