# 配置与密钥

## 1. 两个文件，各管各的

    ~/.fastcode/
      config.json   主服务商、主模型、主题、agent 开关、已启用技能/插件
      auth.json     只放 API Key（单独文件，Termux 上权限 0600）
      skills/       安装的 SKILL.md
      plugins/      插件包
      cache/        缓存
      sessions/     会话记录（预留）
      logs/         日志（预留）
      model-meta.json  可选：覆盖模型上下文窗口 / charsPerToken（见 §4）

改 config.json 永远不会动到 auth.json；反之亦然。
目录可用环境变量 FASTCODE_HOME 整体迁移，例如放到外置存储：

    export FASTCODE_HOME=/data/data/com.termux/files/home/fastcode-data

## 2. config.json 字段

| 字段 | 含义 | 默认 |
|---|---|---|
| providerId | 主服务商 id | anthropic |
| model | 主模型 id | claude-sonnet-5.5 |
| theme | 主题 id | fastcode |
| agentMode | 是否允许本地工具（shell/读写文件） | true |
| systemPrompt | 系统提示 | 内置 |
| enabledSkills | 启用的技能名数组 | [] |
| enabledPlugins | 启用的插件名数组 | [] |
| skillsRegistry | 技能市场地址 | https://skillshub.wtf |
| lifetimeCostUsd | 累计花费（展示用） | 0 |
| sharedDirs | 额外允许读写的目录（相对项目根、`~/`、绝对路径） | [] |
| maxAgentTurns | 单次请求最多工具轮次 | 24 |
| requestIdleTimeoutMs | 流式空闲超时（毫秒） | 60000 |
| contextBudgetChars | 旧字符预算（阶段 4 起由 token 阈值取代，保留但不再参与压缩） | 400000 |
| reasoningEffort | 思考强度 auto/low/medium/high/max | auto |
| capabilities | 缓存的 provider/model 能力；`toolCalling` 记 `native` / `pseudo` | `{ "toolCalling": {} }` |

SSE 连接另有一层 25s「无数据」超时（抛 `NetworkStallError`，已收到的文本保留）；
`requestIdleTimeoutMs` 是外层兜底（默认 60s），两者可以独立触发。
推理型模型（实测 DeepSeek Flash + 工具提示）首 token 可能超过 25s；此时用
`FASTCODE_SSE_IDLE_MS=90000 fastcode` 启动，或把该变量写进 `~/.bashrc`。

流式请求中断后会重试一次，并用最长公共前缀跳过已收到的文本；若新流内容不一致，
丢弃旧前缀、以新流为准（不会拼接）。连接级 429 连续失败到上限时抛 `QuotaError`。

### 本地压缩

默认在 `estTokens > 0.7 × model-meta.contextWindow` 时压缩：保留首条 user 消息和最近 6 轮，
中间区生成 < 1.5k token 的摘要并写入 `~/.fastcode/sessions/summary-*.md`。
heapUsed 超过 `FASTCODE_HEAP_LIMIT_MB`（默认 220）时即使未到阈值也会强制压缩。
`serverCompactionAware` 且收到服务端 opaque state 时不生成本地摘要，避免两份历史混用。
随时用 `/context` 查看 token 估算、阈值与 heap。

最小改法（只写想改的字段即可，其余用默认值）：

    {
      "providerId": "deepseek",
      "model": "deepseek-chat"
    }

## 3. auth.json：Key 绑定到「服务商」

同一 provider 的所有模型共用一把 Key。当前格式为 **version 3**：

    {
      "version": 3,
      "keys": {
        "deepseek": {
          "provider": "deepseek",
          "model": "deepseek-v4-pro",
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

    /login                      # 向导：服务商 → 模型（仅记录来源）→ Key（掩码输入）
    /login deepseek             # 跳过服务商
    /login deepseek deepseek-chat               # 直接进入 Key 输入
    /login deepseek deepseek-chat sk-xxxx       # 一行完成

保存成功后回显：服务商、作用域（该 provider 的全部模型）、Key 尾号、保存位置。
Key 输入时终端以 `*` 掩码显示。

发送消息前会校验当前 provider 是否有可用 Key；没有就拦截并提示。
服务商返回 401/403（鉴权失败）或 402/429（额度/限流）时，界面会给出明确提示。

删除 Key：

    /logout deepseek        # 删除该 provider 的唯一 Key
    /logout deepseek --all  # 同上，兼容旧写法

## 4. 环境变量

取值优先级：**auth.json 的 provider 级 Key** > **服务商环境变量** > legacy 键（仅迁移失败时提示）。
环境变量与 auth.json 都是「服务商级」的，对同一 provider 的所有模型通用；
切换模型不会要求重新输入 Key。

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
| Moonshot | MOONSHOT_API_KEY |
| 智谱 | ZHIPUAI_API_KEY 或 GLM_API_KEY 或 ZHIPU_API_KEY |
| 通义千问 | DASHSCOPE_API_KEY 或 QWEN_API_KEY |
| Ollama | 不需要 Key，可用 OLLAMA_HOST |
| 自定义 | FASTCODE_BASE_URL + FASTCODE_API_KEY + FASTCODE_MODEL |

通用变量：

| 变量 | 作用 |
|---|---|
| FASTCODE_HOME | 数据目录（默认 ~/.fastcode） |
| FASTCODE_STABLE_UI | 设为 1 强制稳定界面 |
| FASTCODE_BASE_URL | 自定义服务商基地址 |
| FASTCODE_MODEL | 自定义服务商默认模型 |
| FASTCODE_UPDATE_REGISTRY | fastcode update 查询地址 |
| FASTCODE_ALLOW_PATHS | 额外允许访问的根目录，多个用系统分隔符（Termux 为冒号） |
| FASTCODE_ALLOW_SHARED_STORAGE | 设为 0 关闭 Termux 默认放行的 ~/storage/shared |
| FASTCODE_TOOL_OUTPUT_LIMIT | 工具输出上限（字符），默认 30000，边产边截断 |
| FASTCODE_SESSION_LOG | 设为 0 关闭 JSONL 会话落盘 |
| FASTCODE_SESSION_CACHE_MB | 会话缓存上限 MB，默认 256，超出先删最旧 |
| FASTCODE_FSYNC | 1 强制 checkpoint 后 fsync；0 关闭；不设时仅在 `$FASTCODE_HOME` 位于 `/sdcard`、`/storage/emulated` 下启用 |
| FASTCODE_COMPACTION | 设为 0 关闭本地历史压缩 |
| FASTCODE_HEAP_LIMIT_MB | heap 强制压缩阈值（MB），默认 220 |
| FASTCODE_SERVER_COMPACTION | 设为 1 启用 server-aware 互斥（有 opaque state 时跳过本地摘要）；实验性 |
| FASTCODE_MAX_SPAWN_PER_TURN | 每轮最多新建 shell 进程数，默认 8；超过时提示批处理或轮询已有 session |
| FASTCODE_TOOL_PROTOCOL | `legacy`（默认）/ `native` / `auto`；原生 tools 返回 400 时自动降级并缓存 `pseudo` |
| FASTCODE_SSE_IDLE_MS | SSE 无数据超时（毫秒），默认 25000；推理型模型首 token 很慢时可调大 |
| FASTCODE_TRUST_ALL | 设为 1 跳过项目信任确认 |
| FASTCODE_ALLOW_DANGEROUS | 设为 1 关闭危险命令拦截 |
| FASTCODE_SHELL_ALLOWLIST | 只允许匹配这些正则的命令，分号分隔 |
| FASTCODE_SHELL_DENY_EXTRA | 追加的危险命令正则，分号分隔 |
| FASTCODE_RESTRICT_TO_WORKSPACE | 设为 1 额外拒绝 ../ 路径穿越 |
| FASTCODE_READ_MAX_BYTES | read_file/read_many 单文件上限，默认 200000 |
| FASTCODE_GREP_MAX_BYTES | grep 单文件上限，默认 1000000 |
| FASTCODE_SPINNER_MS | spinner 帧间隔（毫秒，≥60）；默认 stable 120 / 普通 80 |
| FASTCODE_TOKEN_BUDGET | 单次用户请求累计输入 token 预算；耗尽时返回错误并保留已生成文本；不设或 0 关闭 |
| FASTCODE_COST_BUDGET_USD | 单次用户请求累计费用预算（USD，按 provider 返回的 usage 计）；不设或 0 关闭 |
| FASTCODE_LOOP_EXEMPT | 逗号分隔的工具名，完全跳过循环检测（例如 `shell,apply_patch`） |

### 模型元数据与循环检测

`lib/model-meta.ts` 内置 13 个 provider 默认模型的上下文窗口与 `charsPerToken`。
OpenAI 兼容端点通常不返回窗口大小，因此静态表是压缩与 `/context` 的依据。
可用 `~/.fastcode/model-meta.json`（或 `$FASTCODE_HOME/model-meta.json`）覆盖：

    {
      "deepseek/deepseek-v4-pro": { "contextWindow": 131072, "charsPerToken": 1.7 },
      "my-local-model": { "contextWindow": 32768, "charsPerToken": 2.5, "supportsTools": true }
    }

键可以是 `provider/model`、旧的 `provider::model` 或裸模型 id；用户覆盖优先于内置表。
未知模型回退到 `contextWindow: 32768`、`charsPerToken: 2.5`，不抛错。

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
每个副作用工具在执行前都会重新读取 trust（按 mtime+size memo），不跨调用缓存。

shell 工具在执行前先过危险命令拦截（内置 deny 列表）：
rm -rf、del /f、rmdir /s、format/mkfs/diskpart、dd if=、写入 /dev/sd、
shutdown/reboot/poweroff、fork bomb 会被直接拒绝；正文会给出命中的正则。
需要临时放行时 export FASTCODE_ALLOW_DANGEROUS=1。

### 会话落盘与恢复

每次会话以 JSONL 逐行追加写入 ~/.fastcode/sessions，每行一条事件，
所以崩溃或被杀进程后内容仍可读、可恢复：

    fastcode sessions           列出会话
    fastcode sessions show <id> 打印某次会话
    fastcode resume [id|latest] 在 TUI 中恢复该会话

每轮工具执行后追加一条 `type:"checkpoint"`（turn / cwd / providerId / model / activeFiles / lastFactSeq）。
启动时若最近的会话没有 `session_end`，会提示上次会话未正常结束并给出 resume 命令。

事实流（`.jsonl`）只追加：`user` / `assistant_raw` / `tool_call` / `tool_result` / `checkpoint` /
`session_end`；UI 提示写 `notice`，不进入投影。旁边的 `<id>.projection.json` 是模型实际看到的
工作集（<20KB），带 `toolCatalogHash + providerId::model + cwdDigest` 指纹，不匹配时从事实流重建。
`fastcode resume` 会恢复到会话记录的 cwd / provider / model，并提示目录或 model 不兼容。

缓存上限默认 256MB（FASTCODE_SESSION_CACHE_MB 可调）。剪枝前会先把旧会话摘要写入
`<id>.projection.json`，再删除 `.jsonl`；投影文件不参与自动删除。
checkpoint 的 fsync 见 `FASTCODE_FSYNC`（FUSE/sdcard 上建议开启）。
`fastcode sessions show <id>` 会先列事实，再单独打印 `[projection]` 摘要。

## 5. 三种改主模型的方式（等价）

1. 改文件：nano ~/.fastcode/config.json
2. 命令行：fastcode provider deepseek / fastcode model deepseek-chat
3. 界面内：/provider deepseek / /model deepseek-chat

查看当前值与文件位置：

    fastcode config         # 打印两个文件路径与 config 内容
    fastcode config path    # 只打印 config.json 路径
    fastcode doctor         # 环境 + 缺哪个 Key

## 6. 交互选择器与思考强度（0.1.6-beta）

### 6.1 /model 与 /provider

无参数调用会打开交互列表：

    /model        # 方向键 ↑/↓、1-9 数字直选、Enter 确认、Esc 取消
    /provider

- 列表来自 `provider.listModels()` 与本地静态表的合并去重。
- 打开时会用 `probeProvider()` 探测 `/models`；失败则标注 `(offline)`。
- 旧写法仍然有效：`/model <id>`、`/provider <id>`。

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

## 7. 长任务相关配置（0.1.6-beta）

| 字段 | 作用 | 默认 |
|---|---|---|
| maxAgentTurns | 单次请求最多工具轮次；到上限提示“输入 继续” | 24 |
| requestIdleTimeoutMs | 流式空闲超时；每次收到 chunk 重置 | 60000 |
| contextBudgetChars | 旧字符预算（阶段 4 起由 token 阈值取代，保留但不再参与压缩） | 400000 |

达到轮次上限或断流时历史不会丢：直接输入 `继续` 即可接着做。
历史压缩会保留首条请求与最近 6 轮，把中间区写入 `summary-*.md` 并插入 `[context compacted …]` 标记；
`/context` 可查看当前 token 估算与压缩阈值。

### 双轨工具协议

默认 `legacy`（模型输出 `<fastcode_tool>` 伪协议），行为与旧版一致。
`FASTCODE_TOOL_PROTOCOL=auto` 时，OpenAI 兼容 provider 优先原生 function calling；
Anthropic / Google / 未知 provider 自动用伪协议（fail closed）。
原生请求被 400 拒绝时，本次立即改用伪协议重试，并把 `capabilities.toolCalling` 记为 `pseudo`，
后续不再尝试原生。可用 `legacy` 强制回退、`native` 强制原生（调试用）。

### 后台 shell

执行超过约 2s 的 shell 命令不再阻塞：工具立即返回 `session id` 与当前输出。
模型用 `{"tool":"shell","session_id":"sh_..."}` 轮询增量输出；每次只返回新输出，退避从 1s 到 30s。
POSIX 上最多保留 2 个常驻 `sh -s`（减少 Android phantom 进程），Windows 退化为独立进程。
`/jobs` 列出 session，`/kill <id>` 杀整棵进程树；`FASTCODE_MAX_SPAWN_PER_TURN` 限制每轮新建进程数。
