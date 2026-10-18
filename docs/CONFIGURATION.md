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
| contextBudgetChars | 历史压缩阈值（字符，约 4 字符≈1 token） | 400000 |
| reasoningEffort | 思考强度 auto/low/medium/high/max | auto |

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
| FASTCODE_TRUST_ALL | 设为 1 跳过项目信任确认 |
| FASTCODE_ALLOW_DANGEROUS | 设为 1 关闭危险命令拦截 |
| FASTCODE_SHELL_ALLOWLIST | 只允许匹配这些正则的命令，分号分隔 |
| FASTCODE_SHELL_DENY_EXTRA | 追加的危险命令正则，分号分隔 |
| FASTCODE_RESTRICT_TO_WORKSPACE | 设为 1 额外拒绝 ../ 路径穿越 |
| FASTCODE_READ_MAX_BYTES | read_file/read_many 单文件上限，默认 200000 |
| FASTCODE_GREP_MAX_BYTES | grep 单文件上限，默认 1000000 |
| FASTCODE_SPINNER_MS | spinner 帧间隔（毫秒，≥60）；默认 stable 120 / 普通 80 |

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

### 项目信任与危险命令（安全底线）

首次在某个目录启用 agent 工具前，FastCode 会先问一次是否信任该目录。
信任列表写在 ~/.fastcode/trusted.json，可用命令管理：

    fastcode trust [目录]     信任（并启用 agent 工具）
    fastcode untrust [目录]   撤销信任
    fastcode trusted          列出已信任目录

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

缓存上限默认 256MB（FASTCODE_SESSION_CACHE_MB 可调），超出时先删除最旧的日志。

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
| contextBudgetChars | 历史压缩阈值（约 4 字符≈1 token） | 400000 |

达到轮次上限或断流时历史不会丢：直接输入 `继续` 即可接着做。
历史压缩会保留首条请求与最近 6 条消息，并在对话中插入 `[context compacted …]` 标记。
