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

最小改法（只写想改的字段即可，其余用默认值）：

    {
      "providerId": "deepseek",
      "model": "deepseek-chat"
    }

## 3. auth.json 字段

    {
      "keys": {
        "deepseek": "sk-...",
        "openai": "sk-..."
      }
    }

键名是服务商 id。写入时会把文件权限收紧到 0600（Termux/Linux/macOS 生效）。
TUI 里用 /login <provider> <key> 写入，界面会自动打码，不回显明文。

## 4. 环境变量

优先级：auth.json 里的 Key 高于环境变量。

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
| FASTCODE_SESSION_CACHE_MB | 会话缓存上限 MB，默认 64，超出先删最旧 |
| FASTCODE_TRUST_ALL | 设为 1 跳过项目信任确认 |
| FASTCODE_ALLOW_DANGEROUS | 设为 1 关闭危险命令拦截 |
| FASTCODE_SHELL_ALLOWLIST | 只允许匹配这些正则的命令，分号分隔 |
| FASTCODE_SHELL_DENY_EXTRA | 追加的危险命令正则，分号分隔 |
| FASTCODE_RESTRICT_TO_WORKSPACE | 设为 1 额外拒绝 ../ 路径穿越 |

### 沙箱与共享存储

默认只能访问当前工作目录（沙箱）。**Termux 上会额外默认放行 ~/storage/shared**
（即 /storage/emulated/0），因为手机上的项目和下载通常就放在共享存储里。

    # 再增加允许的根目录（多个用冒号分隔）
    export FASTCODE_ALLOW_PATHS=/sdcard/projects:/sdcard/Download

    # 关闭共享存储放行（更严格）
    export FASTCODE_ALLOW_SHARED_STORAGE=0

判定以**真实路径**为准：软链接只要最终落在允许的根目录内就放行，
指向其它位置一律拒绝。

### 项目信任与危险命令（安全底线）

首次在某个目录启用 agent 工具前，FastCode 会先问一次是否信任该目录。
信任列表写在 ~/.fastcode/trusted.json，可用命令管理：

    fastcode trust [目录]     信任（并启用 agent 工具）
    fastcode untrust [目录]   撤销信任
    fastcode trusted          列出已信任目录

shell 工具在执行前先过危险命令拦截（deny 列表移植自 HKUDS/FastCode 的 nanobot）：
rm -rf、del /f、rmdir /s、format/mkfs/diskpart、dd if=、写入 /dev/sd、
shutdown/reboot/poweroff、fork bomb 会被直接拒绝；正文会给出命中的正则。
需要临时放行时 export FASTCODE_ALLOW_DANGEROUS=1。

### 会话落盘与恢复

每次会话以 JSONL 逐行追加写入 ~/.fastcode/sessions，每行一条事件，
所以崩溃或被杀进程后内容仍可读、可恢复：

    fastcode sessions           列出会话
    fastcode sessions show <id> 打印某次会话
    fastcode resume [id|latest] 在 TUI 中恢复该会话

缓存上限默认 64MB（FASTCODE_SESSION_CACHE_MB 可调），超出时先删除最旧的日志。

## 5. 三种改主模型的方式（等价）

1. 改文件：nano ~/.fastcode/config.json
2. 命令行：fastcode provider deepseek / fastcode model deepseek-chat
3. 界面内：/provider deepseek / /model deepseek-chat

查看当前值与文件位置：

    fastcode config         # 打印两个文件路径与 config 内容
    fastcode config path    # 只打印 config.json 路径
    fastcode doctor         # 环境 + 缺哪个 Key
