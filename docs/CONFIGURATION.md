# 配置与密钥

## 1. 数据目录与文件职责

默认 `~/.fastcode/`（可用 `FASTCODE_HOME` 整体迁移）：

    ~/.fastcode/
      config.json       主配置：provider/model/theme/agentMode/sharedDirs/egress/shellPoolSize/capabilities
      auth.json         仅 API Key（provider 级，权限 0600；删除后需重新 /login）
      trusted.json      已信任目录 + 记住的工具审批（catalogHash 绑定；删除后重新信任）
      model-meta.json   可选：覆盖上下文窗口 / charsPerToken / supportsTools
      skills/           已安装 SKILL.md（含 .fastcode-source 完整性基线）
      plugins/          常驻插件包（PLUGIN.md）
      cache/            registry / 下载缓存（可安全删除）
      sessions/         JSONL 事实流 + <id>.projection.json（会话历史；删除即丢失历史）
      logs/             debug 日志（FASTCODE_DEBUG=1 时写入；可安全删除）

- 改 `config.json` 永远不会动到 `auth.json`；反之亦然。
- 备份建议：`config.json`、`auth.json`、`trusted.json`、`model-meta.json`；`sessions/` 视需要。
- `config.json` 损坏时启动会回退默认值，并保留首次发现的副本为 `config.json.bak`、在 stderr 提示一次；不会静默丢弃原文件。
- `auth.json` 损坏时按空凭据启动，并保留副本为 `auth.json.corrupt.bak`、在 stderr 提示一次；不会静默假装未保存过 key。
- 会话 JSONL 写入失败时进入 `degraded`：stderr 提示一次，`close` 跳过 projection/prune（不把残缺历史固化成已验证副本）；`FASTCODE_SESSION_LOG=0` 为完全不落盘模式。
- 失败路径与退出码映射见 `docs/ERROR_SEMANTICS.md`。
- 可安全清理：`cache/`、`logs/`；`skills/`、`plugins/` 用命令卸载；`sessions/` 用剪枝或删除。
- 常用定位：`fastcode config` 打印路径，`fastcode config path` 只打印 `config.json`。
- 目录可用环境变量 `FASTCODE_HOME` 整体迁移，例如放到外置存储：

      export FASTCODE_HOME=/data/data/com.termux/files/home/fastcode-data

## 2. config.json 字段

| 字段 | 含义 | 默认 |
|---|---|---|
| providerId | 主服务商 id | anthropic |
| model | 主模型 id | claude-sonnet-5.5 |
| theme | 主题 id | fastcode |
| language | UI 语言：`en` / `zh`（接受 `zh-CN` 等前缀）；`FASTCODE_LANG` 优先 | en |
| agentMode | 是否允许本地工具（shell/读写文件） | true |
| systemPrompt | 系统提示 | 内置 |
| enabledSkills | 启用的技能名数组 | [] |
| enabledPlugins | 启用的插件名数组 | [] |
| skillsRegistry | 技能市场地址；默认空，不内置任何市场 | "" |
| lifetimeCostUsd | 累计花费（展示用） | 0 |
| sharedDirs | 额外允许读写的目录（相对项目根、`~/`、绝对路径） | [] |
| maxAgentTurns | 单次请求最多工具轮次 | 24 |
| requestIdleTimeoutMs | 流式空闲超时（毫秒） | 60000 |
| reasoningEffort | 思考强度 auto/low/medium/high/max | auto |
| shellPoolSize | **resident** shell 池并发数；安全默认 2，最大 6；`/threads <1-6>` 修改；不限制 one-shot 路径 | 2 |
| capabilities | 旧版缓存字段，仅为兼容保留；自 0.1.8-beta.1 起**不再参与** native/pseudo 判定（能力只记在进程内） | `{ "toolCalling": {} }` |
| egress | 应用层 egress 策略；见 §2.1 | `{ "enabled": true, "mode": "block", ... }` |
| permissions | 声明式 shell 权限；只作用于 Soft Gate，见 §2.2 | `{ "shell": { "allow": [], "deny": [] } }` |
| checkCommand | 写类工具成功后的检查命令；空为关闭，见 §2.3 | "" |
| checkTimeoutMs | 后置检查超时（毫秒） | 15000 |

### 2.1 egress 策略

```json
{
  "egress": {
    "enabled": true,
    "mode": "block",
    "denyPaths": [],
    "denyGlobs": [],
    "denyContentMarkers": ["AKIA[0-9A-Z]{16}", "-----BEGIN [A-Z ]*PRIVATE KEY-----"],
    "maxScanBytes": 1000000,
    "scanToolOutput": true
  }
}
```

- `enabled`：是否执行 block 拦截；默认 `true`。
- `mode`：`off` / `audit` / `block`。默认 `block`；`audit` 只发 `egress_denied`、不改变工具结果；`off` 是完整 kill switch。`enabled:true + mode:"block"` 才拒绝执行。
- `denyPaths` / `denyGlobs`：追加到内置敏感路径规则，不能删除内置规则；deny 恒胜于任何 allow。内置不可移除项为 `$FASTCODE_HOME/auth.json`（密钥文件）与 `$FASTCODE_HOME/sessions/`（历史对话），跟随 `FASTCODE_HOME` 动态解析。
- `denyContentMarkers`：正则字符串，追加到内置标记；非法正则会忽略。内置标记与 `.env.example`/`.envrc` 放行规则不可由配置删除。
- `maxScanBytes`：outbound 内容/工具输出扫描预算；block 态超预算返回 `EGRESS_DENY`（`scan_budget_exceeded`），audit 态只记录。
- `scanToolOutput`：是否在工具输出返回模型前扫描内容标记。
- block 拒绝返回 `code:"EGRESS_DENY"`，不生成审批请求，不写 `trusted.json`；`FASTCODE_ALLOW_DANGEROUS`、`FASTCODE_TRUST_ALL`、`sharedDirs` 不能覆盖。
- 配置变更通过 config 指纹缓存即时生效。默认即阻断；工具路径对 `auth.json` + `sessions/` 恒拦截，但 `shell` 命令内嵌的文件路径仍按启发式处理、不走 `denyPaths`（见 `ARCHITECTURE.md` §5.1 与 `AUDIT.md` §八）。如需先观察，可临时改为 `mode:"audit"`。

流式空闲超时以 `config.json` 的 `requestIdleTimeoutMs` 为唯一准绳（默认 60000ms），
SSE 解析层与外层重试层共用同一个值，不会再出现 25s 先于 60s 触发的双计时。
`FASTCODE_SSE_IDLE_MS` 仅作为直接调用 `streamSSE` 时的回退默认值；聊天路径以配置为准。
推理型模型（实测 DeepSeek Flash + 工具提示）首 token 可能较慢；此时把
`requestIdleTimeoutMs` 调大（或临时 `FASTCODE_SSE_IDLE_MS=90000` 给独立调用方）。

流式请求中断后会重试一次，并用最长公共前缀跳过已收到的文本；若新流内容不一致，
丢弃旧前缀、以新流为准（不会拼接）。连接级 429 连续失败到上限时抛 `QuotaError`。
HTTP SSE 正常结束但未收到 `[DONE]` / `finish_reason`（Anthropic 为 `message_stop`）时按 `incomplete` 处理，保留已生成文本但不会当作完整回复执行最后一次工具调用。

### 本地压缩

默认在 `estTokens > 0.7 × model-meta.contextWindow` 时压缩：保留首条 user 消息和最近 6 轮（12 条消息），
中间区生成摘要并写入 `~/.fastcode/sessions/summary-*.md`。
heapUsed 超过 `FASTCODE_HEAP_LIMIT_MB`（默认 220）时即使未到阈值也会强制压缩。
`serverCompactionAware` 且收到服务端 opaque state 时不生成本地摘要，避免两份历史混用。当前运行链路未传
`serverOpaqueState`，因此 `FASTCODE_SERVER_COMPACTION=1` 实际不会改变压缩行为（仅为实验性预留）。
摘要 section 顺序为 Notes → Outcomes → Files touched → Requests → Actions；条目超限会追加
`(N more … not listed)`，摘要文件写入失败会留下无 `summaryRef` 的 `compacted` fact，恢复时跳过摘要。
`/compact` 是手动压缩：现在会追加 `compacted` fact（含 `summaryRef`），并在下一条新压缩时清理本会话旧的
`summary-*.md`；`/context` 显示 `compactionConfigFromEnv()` 的实际配置。
`/clear` 会追加 `cleared` fact；恢复时只重建最后一次 `cleared` 之后的事实。
可用 `FASTCODE_COMPACTION_RATIO` / `FASTCODE_COMPACTION_KEEP_TURNS` / `FASTCODE_COMPACTION_SUMMARY_TOKENS` 调整参数。

最小改法（只写想改的字段即可，其余用默认值）：

    {
      "providerId": "deepseek",
      "model": "deepseek-flash"
    }

### 2.2 声明式权限

`permissions.shell.allow` / `deny` 只影响 Soft Gate；Hard Block 永远优先。匹配为 glob（`*`/`?`），也可写成 `/regex/`；`/tmp/*` 这类以 `/` 开头的绝对 glob 不再被误判为正则。层顺序：

1. 全局 `config.json` 的 `permissions`
2. 已信任项目的 `.fastcode/permissions.json`
3. 已信任项目的 `.fastcode/permissions.local.json`

未信任项目的项目/本地层会被忽略。`deny` 命中优先于 `allow`；`allow` 命中直接执行，不再弹审批。
当前只实现 `permissions.shell`；`permissions.read` / `permissions.edit` 尚未实现，文件工具仍走信任 + 沙箱检查。

```json
{
  "permissions": {
    "shell": {
      "allow": ["git status*", "git diff*"],
      "deny": ["*reset --hard*"]
    }
  }
}
```

### 2.3 后置检查

设置 `checkCommand` 后，写类工具成功且产生文件 sideEffects 时会运行一次检查（默认关闭；Termux 未单独开启）。触发工具限定为 `write_file`、`append_file`、`replace_in_file`、`apply_patch`、`copy_file`；`move_path`、`delete_file`、`make_dir` 等不触发，避免误报和额外延迟。命令是静态配置，不拼接模型输出；改动文件通过环境变量 `FASTCODE_CHECK_FILES`（换行分隔）传入，并设置 `FASTCODE_CHECK_MODE=post-write`。检查失败/超时只追加到 tool_result，不改变工具本身的 `ok`。

```json
{
  "checkCommand": "npm test -- --runInBand",
  "checkTimeoutMs": 15000
}
```

### 2.4 指令自动发现与回滚

- 启动/每次运行从全局数据目录、项目根（`.git`/`package.json`）到 cwd 链读取 `AGENTS.md` / `FASTCODE.md`；按 global → project → local 注入 system（agent block 之前），每文件 32KB（按 UTF-8 字节）、总量 96KB 上限。`/context` 显示来源。
- 同名文件按“近层覆盖远层”：子目录的 `AGENTS.md` 会替换根目录同名文件；不同名文件（`AGENTS.md` + `FASTCODE.md`）仍同时保留。本次输入层尚未单独建模。
- `/revert <n>` 删除第 n 条可见 user 消息及之后并重建投影；连续 revert 不会复活更早已撤销的事实。`--files` 文件还原尚未实现。
- 结构化 `oldText/newText` 目前覆盖 `write_file` / `append_file` / `replace_in_file`；`apply_patch` 仍返回 per-file 文本 diff，TUI 仍只显示摘要。

### 2.5 会话计划 / 目标

- `/plan` / `/todo`：`show`、`set a; b`、`add <text>`、`start <n>`、`done <n>`、`remove <n>`、`clear`。
- `/goal <text>` / `/goal off`：设置或清除会话目标。
- 计划落 `plan` fact，投影以受保护的 `[plan]` system message 呈现；自动续跑尚未实现，需手动继续。

### 2.6 Git worktree 隔离

- `/worktree list|create <slug>|diff <path>|apply <path>|remove <path> [--force]`。
- worktree 默认创建在 `$FASTCODE_HOME/worktrees/<repo>/<slug>`，可用 `FASTCODE_WORKTREES_ROOT` 覆盖根目录；分支 `wt/<slug>`，基于当前 HEAD。
- `diff` / `apply` 使用 `git diff HEAD`，包含已 staged 与未 staged 的 tracked 改动；已提交到 worktree 分支的改动不会进入 apply，需手动 merge/cherry-pick。`apply` 要求目标 checkout 无未提交改动，否则拒绝并列出 `git status`。未跟踪文件只在输出中提示，不自动复制。
- 非 git 目录明确报错；dirty worktree 的 remove 需要 `--force` 或先 apply。

### 2.7 外置插件 manifest

插件默认安装在 `$FASTCODE_HOME/plugins/<name>/`；`plugin.json` 的 `scope:"project"` 会安装到 `<cwd>/.fastcode/plugins/<name>/`，仅在项目已信任时加载，并在项目内优先于同名全局插件。可选 `plugin.json`：

```json
{
  "name": "my-pack",
  "version": "1.0.0",
  "scope": "global",
  "capabilities": ["prompt", "skills"]
}
```

仅支持 `prompt` / `skills` 能力；声明其他能力会在导入时拒绝。导入后默认**不启用**，需 `/plugin enable <name>`；核心升级不会覆盖该目录。

## 3. auth.json：Key 绑定到「服务商」

同一 provider 的所有模型共用一把 Key。当前格式为 **version 3**：

    {
      "version": 3,
      "keys": {
        "deepseek": {
          "provider": "deepseek",
          "model": "deepseek-flash",
          "key": "sk-...",
          "addedAt": "2026-10-18T00:00:00.000Z"
        }
      }
    }

- `keys` 的键是 provider id；`model` 只记录“最初从哪个模型保存”，**不参与匹配**。
- 写入时把文件权限收紧到 0600（Termux/Linux/macOS 生效）。
- 界面与命令只回显尾号（如 `sk-****abcd`），不回显明文。

### 旧格式迁移（自动）

读取时兼容 v1 / v2，并自动重写为 v3：

    // v1
    { "deepseek": "sk-..." }

    // v2
    {
      "version": 2,
      "keys": {
        "deepseek::deepseek-chat": {
          "provider": "deepseek", "model": "deepseek-chat",
          "key": "sk-...", "addedAt": "..."
        }
      },
      "legacy": { "anthropic": "sk-..." }
    }

- 同一 provider 有多条旧记录时，保留 `addedAt` **最新**的一条；
  没有时间戳时保留先读到的一条。
- 迁移写盘前会备份原文件：`~/.fastcode/auth.json.v2.bak`。
- 迁移只发生一次；`legacy`/provider-only 键会直接变成可用的 provider 级 Key。
- 只读目录导致迁移无法写盘时，本次运行仍按迁移后的内存视图工作。

### 交互式绑定（推荐）

    /provider                                   # 选择服务商 → 模型 → 按需输入 Key
    /model                                      # 当前服务商/模型 → 按需输入 Key
    /login                                      # 选择服务商 → 模型 → 按需输入 Key
    /login deepseek                             # 从模型选择继续
    /login deepseek deepseek-flash               # 从掩码 Key 输入继续
    /login deepseek deepseek-flash sk-xxxx       # 一行完成

保存成功后回显：服务商、作用域（该 provider 的全部模型）、Key 尾号、保存位置。
Key 输入时终端以 `*` 掩码显示。↑/↓、Enter 和数字键可操作选择器；Esc 取消且不提交未完成的 provider/model 配置。
模型列表离线时显示 provider 内置列表与离线提示；可手动输入 model ID。无需 Key 的 provider 会跳过 Key 步骤。

发送消息前会校验当前 provider 是否有可用 Key；没有就拦截并提示。
服务商返回 401/403（鉴权失败）或 402/429（额度/限流）时，界面会给出明确提示。

删除 Key：

    /logout deepseek        # 删除该 provider 的唯一 Key
    /logout deepseek --all  # 同上，兼容旧写法

## 4. 环境变量

取值优先级：**auth.json 的 provider 级 Key** > **服务商环境变量** > legacy 键（仅迁移失败时提示）。
环境变量与 auth.json 都是「服务商级」的，对同一 provider 的所有模型通用；
切换模型不会要求重新输入 Key。

内部变量：`FASTCODE_SANDBOX` / `FASTCODE_SANDBOX_ROOT` 由 shell 工具为子进程注入，用于标记工作区根；普通用户不需要设置。

| 服务商 | 环境变量 |
|---|---|
| DeepSeek | DEEPSEEK_API_KEY |
| Anthropic | ANTHROPIC_API_KEY 或 CLAUDE_API_KEY |
| OpenAI | OPENAI_API_KEY |
| Google | GEMINI_API_KEY 或 GOOGLE_API_KEY |
| OpenRouter | OPENROUTER_API_KEY |
| Groq | GROQ_API_KEY |
| Mistral | MISTRAL_API_KEY |
| xAI | XAI_API_KEY 或 GROK_API_KEY |
| Moonshot | MOONSHOT_API_KEY；可用 `MOONSHOT_BASE_URL` 覆盖基地址 |
| 智谱 | ZHIPUAI_API_KEY 或 GLM_API_KEY 或 ZHIPU_API_KEY；可用 `ZHIPU_BASE_URL` 覆盖 |
| 通义千问 | DASHSCOPE_API_KEY 或 QWEN_API_KEY；可用 `DASHSCOPE_BASE_URL` 覆盖 |
| Ollama | 不需要 Key，可用 OLLAMA_HOST |
| 自定义 | FASTCODE_BASE_URL + FASTCODE_API_KEY + FASTCODE_MODEL |

通用变量：

| 变量 | 作用 |
|---|---|
| FASTCODE_HOME | 数据目录（默认 ~/.fastcode） |
| FASTCODE_LANG | UI 语言（`en` / `zh`，接受 `zh-CN` 等前缀）；优先于 `config.language`；仅覆盖已抽取到字符串目录的文案 |
| FASTCODE_STABLE_UI | 设为 1 强制稳定界面 |
| FASTCODE_BASE_URL | 自定义服务商基地址 |
| FASTCODE_MODEL | 自定义服务商默认模型 |
| FASTCODE_AUTH_HEADER | 自定义服务的认证头名（如 `x-api-key` / `api-key`）；默认 `authorization` |
| FASTCODE_AUTH_PREFIX | 认证头的值前缀；设置自定义头时默认空串，未设置时默认 `Bearer ` |
| FASTCODE_EXTRA_HEADERS | 额外请求头，JSON 对象（仅字符串值），如 `{"x-org":"acme"}` |
| FASTCODE_UPDATE_REGISTRY | fastcode update 查询地址 |
| FASTCODE_SKILLS_REGISTRY | 覆盖 skills 注册表地址；空字符串或纯空白视为未设置，回落到 `skillsRegistry`；两者都空时按名称/owner-repo 安装会被拒绝，直接 URL 安装仍可用 |
| FASTCODE_DEBUG | 设为 1 打开低流量 stderr 调试日志（timeout 钳位、配置缓存失效等） |
| FASTCODE_ALLOW_PATHS | 额外允许访问的根目录，多个用系统分隔符（Termux 为冒号） |
| FASTCODE_ALLOW_SHARED_STORAGE | 设为 0 关闭 Termux 默认放行的 ~/storage/shared |
| FASTCODE_TOOL_OUTPUT_LIMIT | 工具输出上限（字符），默认 30000，边产边截断 |
| FASTCODE_TOOL_MESSAGE_LIMIT | 单条 tool 消息进入历史的硬上限（字符），默认 1000000；各工具自身限额之外的最终兜底 |
| FASTCODE_SESSION_LOG | 设为 0 关闭 JSONL 会话落盘 |
| FASTCODE_SESSION_CACHE_MB | 会话缓存上限 MB，默认 256，超出先删最旧 |
| FASTCODE_FSYNC | 1 强制 checkpoint 后 fsync；0 关闭；不设时仅在 `$FASTCODE_HOME` 位于 `/sdcard`、`/storage/emulated` 下启用。会话 close（含 `/exit`）仍会对 JSONL 与 projection 做 best-effort fsync |
| FASTCODE_COMPACTION | 设为 0 关闭本地历史压缩 |
| FASTCODE_COMPACTION_RATIO | 本地 token 阈值比例，默认 0.7（取值 0–1） |
| FASTCODE_COMPACTION_KEEP_TURNS | 压缩后保留的“轮”数，默认 6（实际按 2×N 条消息） |
| FASTCODE_COMPACTION_SUMMARY_TOKENS | 摘要 token 预算，默认 1500；超出时按行截断并保留 marker |
| FASTCODE_HEAP_LIMIT_MB | heap 强制压缩阈值（MB），默认 220 |
| FASTCODE_SERVER_COMPACTION | 实验性 server-aware 预留；当前调用方未传 opaque state，实际不改变本地压缩 |
| FASTCODE_MAX_SPAWN_PER_TURN | 每轮最多新建 shell 进程数（resident + one-shot 共用），默认 8；这是每轮新建速率，不是全局并发上限。达上限时 one-shot 立即失败，resident 路径可能排队等已有 shell |
| FASTCODE_TOOL_PROTOCOL | `auto`（默认）/ `native` / `legacy`；`auto` 对兼容 provider 用原生 tools，遇到不支持或 400 时自动降级，能力只缓存在当前进程（不写 `config.json`，也不再读旧的 `config.capabilities.toolCalling`）；`legacy` 强制伪协议，`native` 只走 schema tools 且不再解析文本标记 |
| FASTCODE_STDIO_COMMAND | 配置后注册 `stdio` provider（默认不注册）；值为可执行文件路径 |
| FASTCODE_STDIO_ARGS | 可选，传给 CLI 的 JSON 数组，如 `["--json"]` |
| FASTCODE_STDIO_MODEL | 可选，stdio provider 的默认模型 id，默认 `stdio` |
| FASTCODE_STDIO_ENV_ALLOWLIST | 可选，逗号分隔的宿主环境变量名白名单；不会透传 API key |
| FASTCODE_SSE_IDLE_MS | 直接调用 SSE 解析器时的无数据超时（毫秒），默认 25000；聊天路径由 `requestIdleTimeoutMs` 决定 |
| FASTCODE_TRUST_ALL | 设为 1 跳过项目信任确认 |
| FASTCODE_ALLOW_DANGEROUS | 设为 1 临时放行非 Hard Block 的普通/Soft Gate 命令；Hard Block 永不受影响 |
| FASTCODE_SHELL_ALLOWLIST | 只允许匹配这些正则的命令，分号分隔 |
| FASTCODE_SHELL_DENY_EXTRA | 追加的危险命令正则，分号分隔 |
| FASTCODE_RESTRICT_TO_WORKSPACE | 设为 1 额外拒绝 ../ 路径穿越 |
| FASTCODE_READ_MAX_BYTES | read_file 单次读取上限；read_many 的单文件读取上限，默认 200000 |
| FASTCODE_READ_SCAN_MAX_BYTES | read_file offset/limit 统计总行数时的扫描上限，默认 8000000；超出时 totalLines 为下界并标记 truncated |
| FASTCODE_READ_MANY_MAX_BYTES | read_many 的总输出字节预算，默认 400000；超出后跳过剩余文件并给出 hint。单次调用的 `maxBytes` 会被钳制到该值；单文件错误只标记 skipped，不再丢弃整次结果 |
| FASTCODE_GREP_MAX_BYTES | grep 单文件上限，默认 1000000 |
| FASTCODE_SPINNER_MS | spinner 帧间隔（毫秒，≥60）；默认 stable 120 / 普通 80 |
| FASTCODE_TOKEN_BUDGET | 单次用户请求累计输入 token 预算；耗尽时返回错误并保留已生成文本；不设或 0 关闭 |
| FASTCODE_COST_BUDGET_USD | 单次用户请求累计费用预算（USD，按 provider 返回的 usage 计）；不设或 0 关闭 |
| FASTCODE_LOOP_EXEMPT | 逗号分隔的工具名，完全跳过循环检测（例如 `shell,apply_patch`） |
| FASTCODE_WORKTREES_ROOT | 覆盖 `/worktree` 的 worktree 根目录；默认 `$FASTCODE_HOME/worktrees` |
| FASTCODE_CHECK_FILES | 内部变量：后置检查子进程收到的改动文件列表（换行分隔），通常不手动设置 |
| FASTCODE_CHECK_MODE | 内部变量：后置检查子进程设为 `post-write`，通常不手动设置 |
| RUNPOD_ENDPOINT_ID | catalog `runpod` 的 `{endpoint_id}` 占位符 |
| AZURE_OPENAI_RESOURCE / AZURE_OPENAI_DEPLOYMENT | catalog `azure` 的 `{resource}` / `{deployment}` 占位符；key 用 `AZURE_OPENAI_API_KEY` |
| CLOUDFLARE_ACCOUNT_ID | catalog `cloudflare` 的 `{account_id}`；token 用 `CLOUDFLARE_API_TOKEN` 或 `CF_API_TOKEN` |
| AWS_REGION / AWS_BEARER_TOKEN_BEDROCK | catalog `bedrock` 的 `{region}` 与 Bearer key |
| GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION / GOOGLE_ACCESS_TOKEN | catalog `vertex` 的占位符与 OAuth token |

### 模型元数据与循环检测

`lib/model-meta.ts` 内置 13 个核心 provider 默认模型的上下文窗口、`charsPerToken`、`supportsTools` 与已知模型的 `pricing`；
catalog provider 未提供已验证默认模型时使用通用回退值，可在 `~/.fastcode/model-meta.json` 覆盖。
OpenAI 兼容端点通常不返回窗口大小/计价，因此静态表是压缩、`/context` 与 cost budget 的依据。
可用 `~/.fastcode/model-meta.json`（或 `$FASTCODE_HOME/model-meta.json`）覆盖：

    {
      "deepseek/deepseek-v4-pro": { "contextWindow": 131072, "charsPerToken": 1.7 },
      "my-local-model": {
        "contextWindow": 32768,
        "charsPerToken": 2.5,
        "supportsTools": true,
        "pricing": { "inputUsdPerM": 1, "outputUsdPerM": 2 }
      }
    }

键可以是 `provider/model`、旧的 `provider::model` 或裸模型 id；用户覆盖优先于内置表。
未知模型回退到 `contextWindow: 32768`、`charsPerToken: 2.5`，不抛错。
`doctor` 的 `model price` 行显示计价、`source`（override/built-in/default）与内置快照日期；
未配置 pricing 的模型仍不会累计 `costUsd`，`FASTCODE_COST_BUDGET_USD` 需要已知或覆盖 pricing 才会触发。
`replace_in_file`/`write_file` 的 tool_result 额外带 `oldText/newText/changedStartLine/oldLineCount/newLineCount/diffTruncated`；`--ui json` 对应 `old_text/new_text/changed_start_line/old_line_count/new_line_count/diff_truncated`，文本上限约 16KB。

循环检测按工具副作用分阈值（D-02）：只读工具 6 次、副作用工具 3 次（最近 5 次调用窗口）。
首次命中只注入提醒并清零计数；再次累计到阈值才终止。`FASTCODE_LOOP_EXEMPT` 可豁免指定工具。

### 沙箱与共享存储

默认只能访问当前工作目录（沙箱）。**Termux 上会额外默认放行 ~/storage/shared**
（即 /storage/emulated/0），因为手机上的项目和下载通常就放在共享存储里。

    # 再增加允许的根目录（多个用冒号分隔）
    export FASTCODE_ALLOW_PATHS=/sdcard/projects:/sdcard/Download

    # 或写入 config.json（持久化，支持相对路径与 ~）
    # "sharedDirs": ["/sdcard/fastcode", "~/shared/projects"]

    # 关闭共享存储放行（更严格）
    export FASTCODE_ALLOW_SHARED_STORAGE=0

判定以**真实路径**为准：软链接只要最终落在允许的根目录内就放行，
指向其它位置一律拒绝。`sharedDirs` 是显式扩权，交接/部署时需告知用户。

### patch 安全语义

`apply_patch` 接受 `*** Begin Patch` / `*** End Patch`，支持 Add / Delete / Update / Move。
所有文件先在内存完成 parse → plan，全部成功后才落盘；第二个文件失败时第一个不会改。
上下文不唯一会报错并列出候选行号（绝不静默改第一处）；CRLF 与 0600/0755 权限保持；
符号链接拒绝；`move_path` 拒绝已存在目标；返回逐文件 diff。

已知限制：tmp+rename 会**改变 inode**，且**不保留 xattr / ACL**；文件 watcher 可能需要重启。
FUSE/shared storage 上 rename 失败时回退为备份→覆盖→回读校验；还原失败保留 `.fastcode-backup-*`，`doctor` 的 `backups` 行会列出残留。fallback 成功时 tool_result 标记 `atomic:false`，TUI/headless 都会提示这是 best-effort 写入。
命中敏感路径或 >200 行 diff 的 patch 需要 approval；本构建尚无 approval resolver，按 fail closed
拒绝且零落盘（UI 在阶段 8）。

### 项目信任与危险命令（安全底线）

首次在某个目录启用 agent 工具前，FastCode 会先问一次是否信任该目录。
信任列表写在 ~/.fastcode/trusted.json，可用命令管理：

    fastcode trust [目录]     信任（并启用 agent 工具）
    fastcode untrust [目录]   撤销信任
    fastcode trusted          列出已信任目录

trusted.json 当前为 **version 1**：`paths` 的 key 是 realpath 绝对路径，`tools` 预留给工具级永久批准。
旧的 `{ "trusted": [{ "path", "addedAt" }] }` 结构会在首次读取时自动迁移，不会丢目录。
阶段 1 的 `registry.approve()` 只启用 allow/deny 二元判定；pending 审批与 UI 在阶段 5/8 启用。
声明 `requiresTrust` 的副作用工具会在执行前重新读取 trust（按 mtime+size memo），不跨调用缓存；但 `shell` 的 `soft_gate` 审批分支当前先返回 pending/allow，早于 trust 检查（见 `AUDIT.md` §八 B2-03）。

shell 工具在执行前先过三态判定：`allow` / `soft_gate` / `hard_block`。

- **Hard Block（不可授权）**：根/当前/父/home/变量目标的递归删除、源码目录或通配符递归删除、
  系统路径递归删除、`find -delete`、force-push main/master/prod、`git clean -fdx`、
  `dd of=/dev/*`、mkfs/mke2fs/fdisk/diskpart/format、docker system prune/全删、`kubectl delete --all namespaces`、
  `chmod -R … /`、`chown -R … /系统路径`、shutdown/reboot/poweroff/systemctl stop、
  `.pem`/`*.key`/`auth.json`/sessions 删除或清空、`.env` 截断/单 `>` 覆盖/shred、
  `curl|sh`、`base64 -d|sh`、定向 `printenv`/`env | grep` 敏感词、环境变量输出到网络/文件、
  `eval`/`source`/`.`/`-c` 后跟非字面量、`nc/ncat/socat -e|-c`、`/dev/tcp`、`X=rm; $X -rf /`、
  `find -exec rm …` 等。返回 `[guardrails] HARD_BLOCK action=… target=… reason=…`，
  不受 `FASTCODE_ALLOW_DANGEROUS`、trust、session/always 或配置影响。
- **Soft Gate**：裸 `printenv`/`env`（可审查输出）、普通文件删除、可重建目录删除、
  `git reset --hard`（含 `HEAD~N`，reflog 可恢复）、`git clean -fd`、
  feature 分支 force-push、`kubectl delete ns` / `scale --replicas=0`、普通 `truncate`/`shred` 等；
  审批 resolver 尚未接线时 fail-closed 拒绝。
- 历史 `DEFAULT_DENY` 与 `FASTCODE_SHELL_ALLOWLIST` 拒绝也归入 Soft Gate，不再保留“普通 deny”第四态。

`FASTCODE_ALLOW_DANGEROUS=1` 只绕过 Soft Gate，不能让 Hard Block 通过。
敏感文件（`.env` 家族、`auth.json`/`trust.json`、`id_*`、`*.pem`/`*.key`、sessions、`.ssh`/`.aws`/`.gnupg`/`.fastcode` 等）写入/删除/重命名/外发均为 Hard Block；普通敏感文件读取允许，关键凭据（`id_*`、`/etc/shadow`、`/etc/sudoers`）读取即 Hard Block。外传统一按 basename + 路径段黑名单判定，命中返回 `sensitive_file_egress`；`>>`/`>|` 追加重定向、`tee`/`sed -i`/`cp`/`install` 写入、共享存储重定向同样覆盖。`.env.example` 与 `.envrc` 显式放行。

AST 第二意见（纯 JS `bash-parser`）只做“升级到 hard_block”，不会把形状匹配的 hard 降级；
只解析 `-c`、`find -exec`、`eval/source/.` 三类入口和同段一次变量赋值。解析失败时保留形状匹配结果。

### 审批与交互模式

Soft Gate 命中后生成 pending 请求，由 runner 透传到 TUI resolver；无 resolver 或 resolver 异常一律 fail-closed。
授权范围：`once` 单次；`session` 进程内、绑定 catalogHash；`always` 写入 `trusted.json` 的 `tools`，
catalogHash 变化后失效。`fastcode trusted` 列出，`fastcode trust --forget <key>` 撤销。

    fastcode --ui tty "prompt"       Ink Picker（默认）
    fastcode --ui native "prompt"    Termux:API termux-dialog sheet；缺失/超时回落 tty
    fastcode --ui plain "prompt"     纯文本编号选择（非 TTY 时走 headless）
    fastcode --ui json "prompt"      NDJSON gate:ask/decision/error，stdout 只输出协议

`--ui json` 还输出 `reasoning` / `loop_detected` / `compaction` / `checkpoint` / `summary`（含 `tool_call_count`、`http_request_count`、`last_turn`）帧，均由 `agent/event-stream.ts` 统一带上 `v:1`、`seq`、`ts`、`session_id`、`turn`；gate 帧同样使用 `v:1`。`stream_error` / `incomplete` / `protocol_error` / `loop_detected` 以非 0 退出；`max_turns` 仍为 0。正常结束后 headless 会回收 resident shell，不会因残留会话挂住进程。

Tier 3 不给默认 yes；本批未接备份，因此 Tier 3 破坏性动作 fail-closed。Hard Block 不生成审批请求。

### 会话落盘与恢复

每次会话以 JSONL 逐行追加写入 ~/.fastcode/sessions，每行一条事件，
所以崩溃或被杀进程后内容仍可读、可恢复：

    fastcode sessions           列出会话
    fastcode sessions show <id> 打印某次会话
    fastcode resume [id|latest] 在 TUI 中恢复该会话

每轮工具执行后追加一条 `type:"checkpoint"`（turn / cwd / providerId / model / activeFiles / lastFactSeq）。
启动时若最近的会话没有 `session_end`，会提示上次会话未正常结束并给出 resume 命令。

事实流（`.jsonl`）只追加：`user` / `assistant_raw` / `tool_call` / `tool_result` / `notice` / `egress_denied` / `checkpoint` /
`compacted` / `cleared` / `session_end`；`notice` 与 `egress_denied` 在 projection 中作为 system 消息保留。旁边的 `<id>.projection.json` 是模型实际看到的
工作集（上限约 200KB；单条上限 8000 字符，保留头尾），带 `toolCatalogHash + modelId + cwdDigest + compactionSource` 指纹，不匹配时从事实流重建。
投影前会把工具载荷折叠成“工具 + 目标 + ok/error + 关键错误”事实，不保留完整 output；需要裁掉旧消息时插入
`[projection] N earlier message(s) dropped …`，并保护 `[context summary]`/`[context compacted]` marker 不被优先删除。

退出保存口：`/exit`（以及 `Ctrl+C` 两次）会先尝试中止当前 run，最多等 1000ms 让最终 facts 落盘，
再等待 shell 安全停止，随后写 `session_end{reason:"exit"}` + projection，并对 JSONL 与 projection 做 best-effort fsync。
运行中直接输入 `/exit` 会先提示“将停止当前 run、保留部分输出并保存”，需要在 5s 内再输入一次 `/exit` 确认；
也可先 `/cancel` 或按 Esc 停止当前 run。
`session_end.compaction` 是预留给对话压缩的字段（`source` / `summaryRef` / `pending`），当前为
`{source:"none", summaryRef:null, pending:false}`；后续压缩可填充而不改变事件形状。
`fastcode resume` 会恢复到会话记录的 cwd / provider / model，并提示目录或 model 不兼容。

缓存上限默认 256MB（FASTCODE_SESSION_CACHE_MB 可调）。剪枝前会先把旧会话摘要写入
`<id>.projection.json`，再删除 `.jsonl`；投影文件不参与自动删除。
checkpoint 的 fsync 见 `FASTCODE_FSYNC`（FUSE/sdcard 上建议开启）。
`fastcode sessions show <id>` 会先列事实，再单独打印 `[projection]` 摘要。

## 5. 三种改主模型的方式（等价）

1. 改文件：nano ~/.fastcode/config.json
2. 命令行：fastcode provider deepseek / fastcode model deepseek-flash
3. 界面内：/provider deepseek / /model deepseek-flash

查看当前值与文件位置：

    fastcode config         # 打印两个文件路径与 config 内容
    fastcode config path    # 只打印 config.json 路径
    fastcode doctor         # 环境 + 缺哪个 Key
    fastcode doctor --net   # 额外探测 registry 连通性

## 6. 交互选择器与思考强度（0.1.8-beta.0）

### 6.1 /model 与 /provider

无参数 `/provider`、`/model`、`/login` 会进入统一的 provider → model → key 向导，并从各自对应的步骤开始：

    /provider     # 从 provider 选择开始
    /model        # 当前 provider 的 model 选择；当前 model 默认预选
    /login        # 从 provider 选择开始
    /login deepseek                 # 从 model 选择继续
    /login deepseek deepseek-flash   # 从 masked key 输入继续

- Provider/model picker 支持 ↑/↓ 翻页、Enter、Esc 取消；窗口固定 9 行，`1`–`9` 选择**当前窗口内**的第 N 项（翻页后编号仍连续），新 provider 默认预选其 defaultModel。
- 模型列表由 `provider.listModels()` 返回，provider 离线时使用内置/缓存列表并明确标记 `(offline)`；列表仍支持手动输入 model ID。
- 无需 Key 的 provider 直接完成 model 配置；`/model <id>`、`/provider <id>` 和完整 `/login provider model key` 快捷路径仍然有效。

### 6.2 /effort

    /effort              # 打开选择器：auto / low / medium / high / max
    /effort high         # 直接设置

| Provider | 发送的参数 |
|---|---|
| OpenAI / DeepSeek / Groq / Mistral / xAI / Moonshot / 智谱 / Qwen | `reasoning_effort`（`max` → `high`） |
| OpenRouter | `reasoning: { effort }` |
| Anthropic | `thinking: { type: "enabled", budget_tokens }`，low 1024 / medium 4096 / high 8192 / max 16000 |
| Google / Ollama / Custom | 不发送；保存档位并提示忽略 |

- 默认 `auto`：不发送任何思考参数，保持旧行为。
- 状态栏非 auto 时显示 `effort:high`。
- 若模型返回 400 且错误提到 reasoning/thinking/unsupported，
  客户端会去掉该参数重试一次。

### 6.3 Provider catalog（55 个）

内置 13：anthropic / openai / google / deepseek / openrouter / groq / mistral / xai / moonshot / zhipu / qwen / ollama / custom。

catalog 42（OpenAI 兼容，`providers/catalog.ts`）：
- 聚合/网关：aihubmix、aiwave、hefu、4sapi、aigateway、dmxapi、atlascloud、venice、baseten、atomicchat、featherless、sophnet、omnirouter、edenai、orcarouter、runpod、opencode-zen、opencode-go
- 国内：minimax、volcengine、qianfan、hunyuan、stepfun、spark、siliconflow、302ai
- 国际：together、fireworks、perplexity、cerebras、deepinfra、nvidia、github-models、huggingface、requesty、vllm、lmstudio、cohere
- 云平台占位符：azure、cloudflare、bedrock、vertex（所需环境变量见 §4）

未提供已验证默认模型的 catalog 条目在 model picker 中提供「Enter model ID manually…」；
填入 Key 后可用在线 `/models` 列表。`Replicate`、`小米/京东云/天翼云/联通云/快手`、`oc2api/work2api`
暂未内置（非 OpenAI 方言或无固定 base URL），可用 `custom` 接入。

### 6.4 其他选择器

以下命令无参数时打开与 `/model` 相同的选择器窗口（固定 9 行、`1`–`9` 选当前页、↑/↓ 翻页、Enter 确认、Esc 取消）：

    /theme      # 颜色主题
    /threads    # resident shell 并发 1–6
    /agent      # agent 模式 on/off
    /effort     # 思考强度 auto/low/medium/high/max
    /skills enable|disable|info   # 省略 name 时列出已安装技能
    /plugin enable|disable|info   # 省略 name 时列出插件
    /attach · /kill               # 省略 id 时列出后台 shell 会话

带参数时仍保留快捷路径，例如 `/theme neon`、`/threads 4`、`/agent off`、`/effort high`。
删除类命令（`/skills uninstall`、`/plugin remove`、`/logout`）仍要求显式参数，避免误选。

## 7. 长任务相关配置（0.1.8-beta.0）

| 字段 | 作用 | 默认 |
|---|---|---|
| maxAgentTurns | 单次请求最多工具轮次；到上限提示“输入 继续” | 24 |
| requestIdleTimeoutMs | 流式空闲超时；每次收到 chunk 重置 | 60000 |
| shellPoolSize | **resident** shell 池并发数；默认 2，最大 6，可用 `/threads` 调整；不限制 one-shot 路径 | 2 |

达到轮次上限或断流时历史不会丢：直接输入 `继续` 即可接着做。
旧版 `contextBudgetChars` 已移除；读取旧配置时该字段会被忽略，压缩使用 token 阈值。
历史压缩保留首条请求与最近 6 轮（按 2×N 条消息，即默认 12 条），把中间区写入 `summary-*.md` 并插入 `[context compacted …]` 标记；
摘要优先 Notes/Outcomes/Files，超限条目带 marker，新压缩会清理本会话旧摘要。
`/compact` 现在会写 `compacted` fact；`/clear` 会写 `cleared` fact，resume 只重建 cleared 之后的事实。
`/context` 可查看当前 token 估算、实际 env 阈值与 heap。

### 双轨工具协议

默认 `auto`：OpenAI 兼容 provider（含 DeepSeek）优先原生 function calling；
Anthropic / Google / 未知 provider 自动用伪协议（fail closed）。
原生请求被 400 拒绝时，本次立即改用伪协议重试，并把 `capabilities.toolCalling` 记为 `pseudo`，
后续不再尝试原生。可用 `legacy` 强制回退伪协议、`native` 强制原生并绕过缓存（调试用）。
如需固定单个 `provider::model` 的能力，可写 `capabilities.toolCalling["deepseek::deepseek-flash"] = "native" | "pseudo"`。

这里的「原生」只指 **OpenAI `tool_calls` 方言**（请求 `{type:"function"}` schema、流解析 `delta.tool_calls`、历史 `role:"tool"` + `tool_call_id`）。
白名单为 `openai/openrouter/deepseek/groq/mistral/xai/moonshot/zhipu/qwen/ollama`；Google 走 Google 的 OpenAI 兼容端点但目前不在白名单，Anthropic 的 `tool_use`/`tool_result` 与 Gemini 原生 `functionCall` 没有 adapter。
`native` 强制会绕过白名单，对非该方言的 provider 可能 400 或无效；200 但忽略 `tools` 不会触发自动降级，需 `legacy` 或按模型钉 `pseudo`。

### 后台 shell

执行超过约 2s 的 shell 命令不再阻塞：工具立即返回 `session id` 与当前输出。
模型用 `{"tool":"shell","session_id":"sh_..."}` 轮询增量输出；每次只返回新输出，退避从 1s 到 30s。
shell 工具有两条执行路径，预算互不共享：

| 路径 | 触发 | 限制 / 预算 | 满载行为 |
|---|---|---|---|
| resident | POSIX 且命令未被判定为交互/REPL | `shellPoolSize`：默认 **2**，`/threads <1-6>` 最大 6（仅 resident） | 排队等待空闲 resident（受命令 timeout 限制） |
| one-shot | Windows，或命令命中交互/REPL 判定 | `FASTCODE_MAX_SPAWN_PER_TURN`：默认 **8/轮**（每轮新建速率，不是全局并发上限） | 立即返回 `spawn limit reached`，**不排队** |

- 每个 shell job 只保留最近 **256KB** 输出窗口；更早的内容会被丢弃。runner 另有单条 tool 消息硬上限（`FASTCODE_TOOL_MESSAGE_LIMIT`，默认 1MB）。
- `shell` 与 FastCode 同用户、同 OS 权限，并继承完整 `process.env`（可能含用户导出的 API key）；`FASTCODE_SANDBOX`/`FASTCODE_SANDBOX_ROOT` 只是标记，不是隔离。完整权限模型见 `AUDIT.md` §8.9。
- `FASTCODE_SHELL_ALLOWLIST` 是 Soft Gate（可审批/可被 `FASTCODE_ALLOW_DANGEROUS` 绕过），不是硬白名单；Hard Block 仍优先。
- `/threads` 只调整 resident 池，不影响 one-shot，也不构成“全局最多 2/6 个进程”的承诺。
- `FASTCODE_MAX_SPAWN_PER_TURN` 同时计入新建 resident 和 one-shot；同一轮若新建 2 个 resident，本轮只剩 6 次 one-shot 配额。
- `shellPoolStats().active` 和 `doctor` 的 `active` 统计所有仍在运行的 shell job（resident + one-shot）；`pool/maxPool` 只统计 resident。二者会不一致。
- 同轮默认最多约 8 个新进程（2 resident + 6 one-shot，或 0 resident + 8 one-shot）；跨 turn 时 resident 池保留、one-shot 预算重置，未结束的旧 one-shot 仍占并发（例如既有 2 resident + 本轮 8 one-shot = 10；`/threads 6` 时为 14），长期未结束的 one-shot 没有全局回收上限。
- 命令内部再启动的后台进程不计入上述两个预算；`setsid` 逃逸的后代即使 `shutdownShellsAsync` 也可能清不掉。
- resident 超时/被杀会销毁该 resident，下一条 resident 命令需要新建并消耗本轮 spawn 预算；one-shot 超时同样消耗预算，但不占 resident 池。
- 每条命令在子 shell（resident）或独立进程（one-shot）中执行，`export`/`umask`/`set -e`/`exit` **不跨命令泄漏**。旧观察“常驻 `export` 会让后续命令看见”在 2026-11-09 子 shell 修复后已不成立。
- `needsOneShot` 是 AST 命令名启发式，不是完整 shell 语义：`echo top` 走 resident，`top` 走 one-shot；`python script.py` 走 one-shot，`python -c ...` 走 resident；`node -e ...` 走 resident，`node -v` 走 one-shot。路径差异改变的是并发记账与生命周期，不是单命令状态隔离。
- 含 `&` 等后台操作符的 resident 命令完成后会回收该 resident，防止后台输出串入下一条命令。
- `/jobs` 列出 session，`/kill <id>` 杀整棵进程树。
- `/exit`（`/quit`、`/q`）会中止当前运行、终止所有运行中的 shell 与常驻 shell，再退出；运行中需要二次确认。
- `Esc` 中止当前 run 并保留已生成文本/部分输出，提示输入 `继续`；`Ctrl+C` 在 run 中第一次先中止并保留部分输出，再按一次才退出。

## 8. CLI 子命令与斜杠命令速查（0.1.8-beta.0）

> 原则：子命令与配置类斜杠命令本身不发送模型请求；`fastcode "prompt"`、`resume` 以及 TUI 中发送的消息才会进入对话并可能消耗 token。

### 8.1 CLI 子命令（不启动对话）

| 命令 | 作用 |
|---|---|
| `fastcode` | 启动 TUI |
| `fastcode "prompt"` | 启动 TUI 并带初始提示（会进入对话） |
| `fastcode --version` / `-v` | 显示版本 |
| `fastcode --help` / `-h` / `help` | 显示全部命令与选项（三种写法等价） |
| `fastcode provider` / `provider <id> [model]` | 列出 provider / 设置默认 provider（无已验证默认模型时必须同时给 model） |
| `fastcode model` / `model <id>` | 列出当前 provider 的模型 / 设置默认模型 |
| `fastcode config` / `config path` | 打印配置与数据目录 / 只打印 config.json 路径 |
| `fastcode sessions` / `sessions show <id>` | 列出会话 / 打印某会话事实与投影摘要 |
| `fastcode resume [id|latest]` | 在 TUI 中恢复会话（恢复后可继续对话） |
| `fastcode trust [dir]` / `untrust [dir]` / `trusted` | 信任 / 撤销信任 / 列出信任目录 |
| `fastcode trust --forget <key>` | 撤销某条记住的工具审批 |
| `fastcode skills list\|install <id>\|uninstall <id>\|search <q>` | 技能管理 |
| `fastcode doctor` / `doctor --net` | 环境诊断 / 额外探测 registry 连通性 |
| `fastcode update` | 检查新版本 |
| `--ui tty\|native\|plain\|json` | 审批/渲染后端（默认 tty；plain/json 用于无 TTY） |

API Key 也可由环境变量提供：`DEEPSEEK_API_KEY`、`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY`、`OPENROUTER_API_KEY`、`GROQ_API_KEY`、`MISTRAL_API_KEY`、`XAI_API_KEY`、`MOONSHOT_API_KEY`、`ZHIPUAI_API_KEY`、`DASHSCOPE_API_KEY`。

### 8.2 TUI 斜杠命令（纯客户端操作）

| 命令 | 作用 | 示例 |
|---|---|---|
| `/help` (`h`, `?`) | 列出全部斜杠命令 | `/help` |
| `/about` (`version`) | 版本、平台、Node、链接 | `/about` |
| `/config` | 打印生效配置与数据路径 | `/config` |
| `/theme [id]` | 主题选择器；带 id 直接切换 | `/theme` → picker |
| `/system [prompt]` | 查看或设置系统提示词 | `/system 你是一个简洁助手` |
| `/reset` | 恢复默认 provider/model/theme/system prompt（不动 Key） | `/reset` |
| `/whoami` | 当前 Key 来源（文件/env）与全部已存 Key（掩码） | `/whoami` |
| `/provider [id]` | provider 选择器；带 id 直接切换（无已验证默认模型时进入模型选择） | `/provider` / `/provider together` |
| `/model [id]` | 当前 provider 的模型选择器；带 id 直接设置 | `/model` |
| `/effort [level]` | 思考强度选择器 `auto/low/medium/high/max` | `/effort` / `/effort high` |
| `/login [provider] [model] [key]` | provider → model → Key 向导 | `/login` / `/login deepseek deepseek-flash <key>` |
| `/logout <provider> [model\|--all]` | 删除已存 Key（provider 级） | `/logout deepseek --all` |
| `/agent [on\|off\|status]` | agent 模式选择器 / 显式开关 / 状态 | `/agent` → picker |
| `/tools` | 列出 15 个 agent 工具 | `/tools` |
| `/cwd` | 显示当前工作目录与沙箱根 | `/cwd` |
| `/plugin [...]` | 常驻插件：`list/import/enable/disable/remove/info`；`enable/disable/info` 省略名字时打开选择器 | `/plugin enable` |
| `/skills [...]` | 技能：`list/search/install/uninstall/enable/disable/info/verify/registry`；`enable/disable/info` 省略名字时打开选择器 | `/skills info` |
| `/clear` (`cls`) | 清空当前会话历史并写 `cleared` fact | `/clear` |
| `/compact` | 强制压缩历史并写 `compacted` fact | `/compact` |
| `/context` | 当前 token 估算、压缩阈值、heap、指令来源 | `/context` |
| `/revert <n>` | 删除第 n 条 user 消息及之后并重建投影；`--files` 未实现 | `/revert 2` |
| `/plan` (`/todo`) | 查看/编辑会话计划 | `/plan set a; b` |
| `/goal` | 设置会话目标 | `/goal ship it` |
| `/worktree` | git worktree list/create/diff/apply/remove | `/worktree create fix-ui` |
| `/cost` | 本会话 token 与费用 | `/cost` |
| `/expand` | 切换工具输出展开/折叠 | `/expand` |
| `/cancel` | 取消当前 run（保留部分输出） | `/cancel` |
| `/steer <text>` | 运行中追加引导 | `/steer 改用更小的改动` |
| `/exit` (`quit`, `q`) | 退出；run 中需 5s 内二次确认 | `/exit` |
| `/jobs` | 列出后台 shell 会话 | `/jobs` |
| `/attach [id]` | 查看后台会话的新输出；省略 id 时打开会话选择器 | `/attach` |
| `/kill [id]` | 终止后台会话进程树；省略 id 时打开会话选择器 | `/kill` |
| `/bg` | 说明长命令自动转后台机制 | `/bg` |
| `/threads [1-6]` (`pool`) | resident shell 并发选择器 / 设置 | `/threads` → picker |
| `/edit` | 用 `$EDITOR` 编辑当前输入 | `/edit` |

说明：`/provider`、`/model`、`/theme`、`/threads`、`/agent`、`/effort` 无参数时都会打开同一套选择器；带参数时保留快捷路径。

说明：`/system` 本身不发模型请求，但会改变后续对话的系统提示词；`/agent`、`/theme`、`/config`、`/reset`、`/whoami` 等只改本地状态/配置。

### 8.3 设置入口

- 持久配置：`~/.fastcode/config.json`（provider/model/theme/sharedDirs/agentMode/egress/shellPoolSize 等）；`fastcode config path` 可直接定位。
- Key：`~/.fastcode/auth.json`（0600，provider 级；v1/v2 自动迁移，见 §3）。
- 环境变量：见 §4；新增压缩参数 `FASTCODE_COMPACTION_RATIO` / `KEEP_TURNS` / `SUMMARY_TOKENS` 与 shell `shellPoolSize` / `FASTCODE_MAX_SPAWN_PER_TURN` 见对应小节。
