# FastCode

> 跑在终端里的 AI 编程助手，支持 Termux/Android、Linux、macOS 和 Windows。

FastCode 连接模型服务商，能读写文件、执行命令、搜索代码。仓库自带 `dist/cli.js`，克隆后无需 `npm install` 即可运行。

| 项目 | 值 |
|---|---|
| 命令 | `fastcode`（短别名 `fc`） |
| 数据目录 | `~/.fastcode`（可用 `FASTCODE_HOME` 修改） |
| 源码 | https://github.com/dateName/fastcode-termux |
| 文档 | [配置](docs/CONFIGURATION.md) · [架构](docs/ARCHITECTURE.md) · [排障](RUNBOOK.md) |

**English → [README.md](README.md)**

---

## 📖 项目简介

FastCode 是一个跑在终端里的**多模型 AI 编程助手**（TUI）。它连接你常用的模型服务商，
能像 agent 一样**读文件、改文件、执行命令、搜索代码**，并支持 Agent Skills 扩展能力。

FastCode-Termux 独立维护，面向 Termux/Android。TypeScript 源码在 `package/src`，
`npm run build` 可重新构建 `dist`。

发布物为**自包含单文件** `package/dist/cli.js`（用 esbuild 把 Ink/React/meow 等依赖全部内联），
因此 `git clone` 后**不需要 `npm install`** 就能运行。

---

## ✨ 功能特性

| 特性 | 描述 |
|---|---|
| 💬 多模型聊天 | **55 个服务商**（13 内置 + 42 个 OpenAI 兼容 catalog），用 `/provider`、`/model` 随时切换 |
| 🛠️ 本地编码代理 | 读写文件、grep、打补丁、运行 shell 命令（默认开启） |
| 🔎 代码导航 | 搜索项目、按结构定位、批量读取文件 |
| 🧩 Agent Skills | 安装 `SKILL.md` 技能扩展行为；目录 sha256 完整性锁定，`/skills verify --confirm` 重新基线 |
| 🧠 思考强度 | `/effort` 切换 auto/low/medium/high/max，状态栏显示当前档位 |
| 🎨 主题 | `/theme` 切换配色 |
| 🌐 界面语言 | 英文 / 简体中文 字符串目录（`FASTCODE_LANG=zh` 或 `config.language`）；目前仅覆盖已抽取的 UI 文案 |
| 💰 用量统计 | 状态栏显示 token 与成本 |
| 🤖 模型支持 | **DeepSeek / OpenAI / Anthropic**，以及 Gemini、通义千问、GLM、Kimi、Grok、OpenRouter、Ollama 等 |
| 💾 恢复 | 事实流 + `*.projection.json`；resume 恢复 cwd/provider/model 与未配对 tool_call |
| 🧠 上下文 | `/context`、`/compact`、`/clear`；token/heap 触发本地压缩并落盘 `summary-*.md`；`/compact`/`/clear` 会写事实，旧摘要会清理 |
| 🖥️ 后台 shell | 长命令返回 session id；`/jobs` `/attach` `/kill`；POSIX 常驻 `sh -s` 池默认 2，可用 `/threads` 调至 6；one-shot 命令走独立每轮 spawn 预算 |
| 🧰 双轨协议 | 伪协议 `<fastcode_tool>` 或原生 `tool_calls`（默认 `auto`；原生仅指 OpenAI 方言，其他 provider 失败即回落伪协议）；`FASTCODE_TOOL_PROTOCOL=legacy|native|auto` |
| 📱 手机命令 | `/cancel` `/steer` `/expand` `/edit`（外部编辑器绕开 IME 问题） |

**快捷键**

| 键 | 作用 |
|---|---|
| `Ctrl+C` | 运行中：第一次取消并保留部分输出，第二次退出；空闲：单按提示，再按退出 |
| `Esc` | 终止当前思考 / 流式输出，保留已生成的部分输出 |

---

## 安全

FastCode 能改文件、跑命令，所以以下边界默认开启：

- **目录信任**：第一次进入新目录会询问。
- **文件沙箱**：文件工具限制在项目内；`../` 和软链接逃逸会被拒绝。
- **危险命令**：破坏性命令、凭据读取和敏感数据外发会被拦截或要求审批。
- **审批**：敏感或大改动需要批准；没有审批通道时直接拒绝。
- **输出限制**：控制台和模型输出都有上限，避免单条命令把会话撑爆。
- **会话恢复**：会话按 JSONL 追加写入，崩溃后可以恢复。

API Key、自定义路径和更细的策略见 [配置](docs/CONFIGURATION.md)；
实现细节见 [审计](docs/AUDIT.md) 和 [错误语义](docs/ERROR_SEMANTICS.md)。

### 备注

- Termux 上 IME 光标可能受 pty 尺寸影响；`stty` 或 `/edit` 通常能解决。
- 原生工具调用只用于 OpenAI 兼容服务商，其余走伪协议。
- `/threads` 控制的是常驻 shell 池，不是全局并发数。

---

## 💻 系统要求

| 项 | 要求 |
|---|---|
| Node.js | ≥ 18.17（`node -v` 检查） |
| git | 方式一 / 方式三 安装需要（方式二便携版不需要） |
| 系统 | Termux(Android) / Linux / macOS / Windows |
| 架构 | aarch64 / armv7 / x86_64 均可；若遇二进制不兼容，请改用方式三（手动安装，在本机重新拉取依赖） |

Termux 安装依赖并放开存储权限：

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git ca-certificates
termux-setup-storage     # 让 agent 能访问 ~/storage/shared（手机项目/下载/相册）
```

---

## 📦 安装方式

按推荐优先级排列。仓库内已提交 **自包含打包产物** `package/dist/cli.js`（esbuild 把 Ink/React/meow 等依赖全部打进单文件），因此克隆后**无需 `npm install`** 即可运行。

从 npm 安装：`npm install -g @datename/fastcode-termux@latest`（`latest` 为当前正式版；`beta` 仍为 0.1.8-beta.4）。`release/` 为正式版资产。

> ⚠️ **不要 `git clone` 后直接 `node package/bin/fastcode.mjs` 就完事**：若 `package/dist/cli.js` 存在则没问题；一旦它缺失或你拿到的是旧版本，请按下文任选一种方式安装，不要只 clone。

### 方式一：一键脚本（推荐）

```bash
git clone https://github.com/dateName/fastcode-termux.git
cd fastcode-termux
bash scripts/install.sh
fastcode          # 直接可用（短别名 fc）
```

脚本把 `package/dist/cli.js` 软链到 `$PREFIX/bin`（Termux）或 `~/.local/bin`，**完全跳过 npm install**；只有产物缺失时才回退到 `npm install && npm run build`。

### 方式二：便携版（无需 npm）

发布构建后，到 Releases 下载 `fastcode-portable-<version>.tar.gz`（校验见 `SHA256SUMS`），解压即用：

```bash
tar -xzf fastcode-portable-<version>.tar.gz
cd fastcode-portable-<version>
./fastcode
```

> `release/` 保存最近一次已发布的资产；`npm run build` + `sh scripts/build-portable.sh` 会按当前 `package.json` 版本重新生成 `fastcode-portable-<version>.tar.gz|zip`、`datename-fastcode-termux-<version>.tgz` 与 `SHA256SUMS`。

### 方式三：从源码运行（仅在你要改源码 / 重新构建时）

日常使用**不需要**这一步 —— 仓库里已含可运行的打包产物（见上文）。
只有当你修改 `package/src` 或想本地重建时才用它：

```bash
git clone https://github.com/dateName/fastcode-termux.git
cd fastcode-termux/package
npm install          # 仅重建 / 跑 TypeScript 源码时需要
npm run build        # 由 src/ 重新生成 dist/
npm link             # 之后即可全局使用 fastcode / fc
```

只想直接跑已提交的产物，则完全不用安装：

```bash
node package/dist/cli.js          # 或：node package/bin/fastcode.mjs doctor
```

---

## 🚀 快速开始

```bash
# 1) 配一把 Key（建议写入 ~/.bashrc 以持久化）
export DEEPSEEK_API_KEY=sk-你的key

# 2) 启动
fastcode
```

> 💡 推荐 DeepSeek：便宜、中文好。也可用 Claude、OpenAI、Gemini、通义千问、GLM、Kimi、Grok 等。
>
> 🔒 第一次进入某个目录时，FastCode 会问一次是否信任它（因为 agent 能读写文件、执行命令），按 `y` 即可。
>
> 📱 Termux 建议：先 `termux-setup-storage`，再 `termux-wake-lock` 防止锁屏杀掉会话。

---

## 🔑 配置 API Key

任选**一家**服务商，把 Key 放进对应环境变量：

| 服务商 | 环境变量 |
|---|---|
| **DeepSeek** ⭐ | `DEEPSEEK_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google | `GEMINI_API_KEY` |
| 通义千问 | `DASHSCOPE_API_KEY` |
| 智谱 GLM | `ZHIPUAI_API_KEY` |
| Moonshot | `MOONSHOT_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Groq / Mistral | `GROQ_API_KEY` / `MISTRAL_API_KEY` |
| Ollama | 不需要 Key（本地免费） |
| 自定义接口 | `FASTCODE_BASE_URL` + `FASTCODE_API_KEY` |
| Stdio CLI（可选） | `FASTCODE_STDIO_COMMAND`（可选 `FASTCODE_STDIO_ARGS`、`FASTCODE_STDIO_MODEL`、`FASTCODE_STDIO_ENV_ALLOWLIST`） |

**持久化到 `~/.bashrc`，重开终端也生效：**

```bash
echo 'export DEEPSEEK_API_KEY=sk-你的key' >> ~/.bashrc
```

**或**在 TUI 里配置。无参数 `/provider`、`/model`、`/login` 使用同一套键盘向导：↑↓ 移动、Enter 确认、`1`–`9` 快速选择编号项；Esc 取消且不改配置。API Key 输入以 `*` 掩码。

```text
/provider                                   # 选择服务商 → 模型 → Key
/model                                      # 当前服务商/模型 → Key
/login                                      # 选择服务商 → 模型 → Key
/login deepseek deepseek-flash               # 从掩码 Key 输入继续
/login deepseek deepseek-flash sk-你的key     # 或一行完成
```

离线时会显示内置/缓存模型列表与提示，也可手动输入 model ID；无需 Key 的服务商会跳过 Key 步骤。每次保存都会回显 **服务商 · 适用于该服务商全部模型 · Key 尾号（`sk-****abcd`）· 保存位置**。

> 🔐 Key 存在 `~/.fastcode/auth.json`，**每个 provider 一把**，与 `config.json` 分离。同一服务商内切换模型会复用同一把 Key。v1/v2 旧文件首次读取时自动迁移，并备份为 `auth.json.v2.bak`——详见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。环境变量（`DEEPSEEK_API_KEY` 等）同样是服务商级的。

---

## 🧰 常用命令

| 命令 | 作用 |
|---|---|
| `fastcode` / `fastcode "解释这个仓库"` | 进入 TUI / 带初始问题启动 |
| `fastcode --version` / `-v` / `--help` / `-h` / `help` | 版本 / 全部命令 |
| `fastcode provider [id] [model]` / `model [id]` | 列出或设置默认 provider / 模型（provider 无已验证默认模型时需同时给 model） |
| `fastcode config` / `config path` | 查看配置与路径 / 只打印 config.json |
| `fastcode sessions` / `sessions show <id>` / `resume [id\|latest]` | 列出 / 查看 / 恢复会话 |
| `fastcode trust [dir]` / `untrust [dir]` / `trusted` / `trust --forget <key>` | 信任目录与记住的审批 |
| `fastcode skills list\|install <id>\|uninstall <id>\|search <q>` | 技能管理 |
| `fastcode doctor` / `doctor --net` | 环境自检；`--net` 额外探测 registry 连通性 —— **排障先跑这个** |
| `fastcode update` | 检查新版本 |
| `--ui tty\|native\|plain\|json` | 审批/渲染后端（默认 tty；plain/json 用于无 TTY） |

`fastcode "prompt"` 和 `resume` 会进入对话；上面的子命令本身不发送模型请求。

**TUI 斜杠命令（不发模型请求）：**
- 配置/信息：`/help` `/about` `/config` `/theme` `/system` `/reset` `/whoami`
- 模型/Key：`/provider` `/model` `/effort` `/login` `/logout`
- 上下文/运行：`/clear` `/compact` `/context` `/cost` `/expand` `/cancel` `/steer` `/exit`
- Agent/后台：`/agent` `/tools` `/cwd` `/jobs` `/attach` `/kill` `/bg` `/threads`（`/pool`）
- 扩展/输入：`/skills` `/plugin` `/edit`

完整命令与设置说明见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。

---

## ❓ 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| `git clone` 后直接运行报 `ERR_MODULE_NOT_FOUND` | 说明你在用未打包的旧产物。跑 `bash scripts/install.sh`；仓库已含 `dist/cli.js` 时也可直接 `node package/dist/cli.js`。只有方式三才需要 `npm install` |
| 安装很慢 / 卡住（仅方式三） | 换 npm 镜像：`npm config set registry https://registry.npmmirror.com` |
| 权限错误 / 读不到手机文件 | 先跑 `termux-setup-storage`；确认 `~/storage/shared` 已生成 |
| 架构不兼容 / 原生模块报错 | 改用**方式三：从源码**（`npm install`），让依赖在本机重新拉取 |
| API Key 无效 | 用 `fastcode doctor` 看缺哪个；检查环境变量名与值，或 `/login` 重新登录 |
| 如何更新 | `cd ~/fastcode && git pull && bash scripts/install.sh`（单跑 install.sh 不会拉取） |
| npm 安装后行为旧 / 报错 | npm registry 可能落后于仓库 —— 暂时优先用克隆或便携版；`fastcode update` 会比较版本 |
| 提示 requires a TTY | 要在**真实终端**运行；管道或某些远程工具会触发，Termux 正常 |
| 单按 Ctrl+C 就退出 | 已修复：单按只提示，再按一次才退（确认构建包含该修复） |
| 命令被拦截 | 那是危险命令保护；确认无误可临时 `export FASTCODE_ALLOW_DANGEROUS=1` |

---

## 🗑️ 卸载

```bash
npm uninstall -g @datename/fastcode-termux
rm -rf ~/fastcode        # 克隆目录（可选）
rm -rf ~/.fastcode       # 配置、Key、技能、会话（可选）
```

便携包：直接删除解压出的目录即可。

---

## 🏗️ 开发者

### 构建自包含产物

源码在 `package/src`，用 esbuild 打包成单文件 `package/dist/cli.js`：

```bash
cd package
npm install
npm run build          # = tsc（类型/多文件输出） + node scripts/build.mjs（esbuild 打包）
npm run build:bundle   # 只跑 esbuild（可加 --no-minify 出不压缩版本调试）
```

> `dist/cli.js` 必须提交到 Git —— 这是「clone 即可用」的关键。

### 发布新版本

1. 修改 `package/package.json` 的 `version`。
2. `cd package && npm run build` 重新生成 `dist/cli.js` 并提交。
3. 打 tag 推送，GitHub Actions 会自动构建并上传 Release（见下）。
4. 按下方流程产出并上传产物。

### 构建便携包

```bash
sh scripts/build-portable.sh
```

产物在 `release/`：

```text
fastcode-portable-<version>.tar.gz       免安装便携包（自包含单文件）
fastcode-portable-<version>.zip          同上（需系统有 zip）
datename-fastcode-termux-<version>.tgz   npm 包（npm pack）
SHA256SUMS                               以上文件的校验和

# <version> 取自 package/package.json。
```

### 发布 npm

设置仓库 Secret `NPM_TOKEN` 后，CI 会在推送 `v*` tag 时自动 `npm publish`
（见 `.github/workflows/release.yml`）。手动兜底：

```bash
cd package
npm publish --access public --tag beta
```

### GitHub Releases

推荐用 CI 自动发布（`.github/workflows/release.yml`）：打 tag 即可

```bash
git tag v<version>
git push origin v<version>        # 触发 Actions：构建 + 打包 + 上传 Release
```

也可手动：

```bash
gh release create v<version> -t "FastCode <version>" \
  release/fastcode-portable-<version>.tar.gz \
  release/datename-fastcode-termux-<version>.tgz \
  release/SHA256SUMS
```

### package.json 要点

```json
{
  "bin": { "fastcode": "bin/fastcode.mjs", "fc": "bin/fastcode.mjs" },
  "files": ["bin", "dist", "src", "tsconfig.json", "assets", "README.md", "LICENSE"]
}
```

### 更多文档

| 文件 | 内容 |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 全部部署方式与排障 |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | 两个配置文件、全部环境变量 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构、模块、数据流 |
| [docs/MODULES.md](docs/MODULES.md) | 每个文件干什么 |
| [docs/AUDIT.md](docs/AUDIT.md) | 安全审计结论 |
| [docs/DEVLOG.md](docs/DEVLOG.md) | 改动日志、迁移、风险与回滚 |
| [LOCALIZATION_REPORT.md](LOCALIZATION_REPORT.md) | 0.1.6-beta 交接报告（历史） |
| [CHANGELOG.md](CHANGELOG.md) | 分版本更新日志（含历史版本） |
| [PATCHES.md](PATCHES.md) | 既有修复 + harness 改造 |

---

## ℹ️ 关于本项目

- FastCode-Termux 独立维护，面向 Termux/Android；`package/src` 是源码真相源，
  `npm run build` 重新构建 `dist`。

---

## 🙏 致谢

感谢 FastCode-Termux 贡献者与开源依赖作者：Ink、React、meow、cfonts、marked、chalk 等。

## 📜 许可证

MIT。版权声明保留在 [LICENSE](LICENSE)。

<sub>Made for Termux 🐧📱 · FastCode</sub>
