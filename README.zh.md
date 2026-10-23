# ⚡ FastCode 手机版

> **装在手机终端里的 AI 编程助手** —— 为 Termux / Android 优化，一行命令从 GitHub 仓库安装。

| 项目 | 值 |
|---|---|
| 版本 | **0.1.6-beta**（测试版） |
| 命令 | `fastcode`（短别名 `fc`） |
| 数据目录 | `~/.fastcode`（可用 `FASTCODE_HOME` 修改） |
| 仓库 | https://github.com/dateName/fastcode-termux |

**English → [README.md](README.md)**

---

## 📖 项目简介

FastCode 是一个跑在终端里的**多模型 AI 编程助手**（TUI）。它连接你常用的模型服务商，
能像 agent 一样**读文件、改文件、执行命令、搜索代码**，并支持 Agent Skills 扩展能力。

本项目基于上游 `SimpleLittleDev/FastCode` 0.1.3 编译产物做了修复与手机适配，
并已**逆向重建 TypeScript 源码**（`package/src`，`npm run build` 可重新编译）。

发布物为**自包含单文件** `package/dist/cli.js`（用 esbuild 把 Ink/React/meow 等依赖全部内联），
因此 `git clone` 后**不需要 `npm install`** 就能运行。

---

## ✨ 功能特性

| 特性 | 描述 |
|---|---|
| 💬 多模型聊天 | **13 个服务商**，用 `/provider`、`/model` 随时切换 |
| 🛠️ 本地编码代理 | 读写文件、grep、打补丁、运行 shell 命令（默认开启） |
| 🔎 代码导航 | 搜索项目、按结构定位、批量读取文件 |
| 🧩 Agent Skills | 安装 `SKILL.md` 技能以扩展行为 |
| 🧠 思考强度 | `/effort` 切换 auto/low/medium/high/max，状态栏显示当前档位 |
| 🎨 主题 | `/theme` 切换配色 |
| 💰 用量统计 | 状态栏显示 token 与成本 |
| 🤖 模型支持 | **DeepSeek / OpenAI / Anthropic**，以及 Gemini、通义千问、GLM、Kimi、Grok、OpenRouter、Ollama 等 |
| 💾 恢复 | 事实流 + `*.projection.json`；resume 恢复 cwd/provider/model 与未配对 tool_call |
| 🧠 上下文 | `/context`、`/compact`；token/heap 触发本地压缩并落盘 `summary-*.md` |
| 🖥️ 后台 shell | 长命令返回 session id；`/jobs` `/attach` `/kill`；POSIX 常驻 `sh -s` 池 |
| 🧰 双轨协议 | 伪协议 `<fastcode_tool>` 或原生 `tool_calls`；`FASTCODE_TOOL_PROTOCOL=legacy|native|auto` |
| 📱 手机命令 | `/cancel` `/steer` `/expand` `/edit`（外部编辑器绕开 IME 问题） |

**快捷键**

| 键 | 作用 |
|---|---|
| `Ctrl+C` | 退出（按两次；单按只提示，不会误退） |
| `Esc` | 终止当前思考 / 流式输出 |

---

## 🛡️ 安全与可靠性

| 能力 | 行为 | 覆盖方式 |
|---|---|---|
| 🔒 项目信任 | 首次在未知文件夹运行时，会在代理工具加载前询问 | `fastcode trust` / `untrust` / `trusted`；`FASTCODE_TRUST_ALL=1` |
| 🧱 文件沙箱 | 文件工具限制在项目内；`../` 与软链接逃逸都会被拒绝 | `config.sharedDirs`、`FASTCODE_ALLOW_PATHS` |
| 🚫 危险命令拦截 | `rm -rf`、`dd`、`mkfs`、fork bomb 等在**执行前**被拒绝 | `FASTCODE_ALLOW_DANGEROUS=1` |
| ✂️ 统一输出上限 | 输出边产生边截断（默认 30000 字符） | `FASTCODE_TOOL_OUTPUT_LIMIT` |
| 💾 会话日志 | 追加写入的 JSONL（append-only），崩溃后仍可恢复 | `fastcode sessions` / `fastcode resume`；缓存上限 **256MB** |
| 🧾 补丁事务 | parse → plan → apply；保持 CRLF/mode；拒绝符号链接；move 不覆盖 | `/expand` 查看完整 diff |
| 🛑 进程树 | abort/`/kill` 杀子进程与孙进程 | POSIX 进程组；Windows `taskkill /T` |
| 🔐 审批钩子 | 敏感/大补丁需要审批；无 resolver 时 **拒绝**（fail closed） | pending UI 尚未实现 |

### 已知限制（0.1.6-beta）

- Ink 5.x 的 IME 组合可能让字符乱序（`abcdef` → `bcdefa`）；请用 `/edit`，或等 Ink ≥6.7 升级。
- 进程内有 3 个 `string-width` 版本，歧义宽度字符可能列宽不一致。
- 原生 tools 只覆盖 OpenAI 兼容服务商，其余走伪协议。
- approval pending 没有 TUI resolver，命中时零落盘拒绝。

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

到 Releases 页面下载最新 `fastcode-portable-0.1.6.tar.gz`（校验见 `SHA256SUMS`），解压即用：

```bash
tar -xzf fastcode-portable-0.1.6.tar.gz
cd fastcode-portable-0.1.6
./fastcode
```

> 便携版尚未上传时，可用 `sh scripts/build-portable.sh` 自行构建，或用 GitHub Actions 自动发布（见 [开发者](#-开发者)）。

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

**持久化到 `~/.bashrc`，重开终端也生效：**

```bash
echo 'export DEEPSEEK_API_KEY=sk-你的key' >> ~/.bashrc
```

**或**启动后在界面里绑定（Key 绑定到具体的「服务商 + 模型」，输入时以 `*` 掩码）：

```text
/login                                      # 向导：服务商 → 模型 → Key（掩码输入）
/login deepseek deepseek-chat sk-你的key     # 或一行完成
```

每次保存都会回显 **服务商 · 模型 · Key 尾号（`sk-****abcd`）· 保存位置**，所以你始终知道这把 Key 属于哪个模型。

> 🔐 Key 存在 `~/.fastcode/auth.json`，**每个 provider 一把**，与 `config.json` 分离。同一服务商内切换模型会复用同一把 Key。v1/v2 旧文件首次读取时自动迁移，并备份为 `auth.json.v2.bak`——详见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。环境变量（`DEEPSEEK_API_KEY` 等）同样是服务商级的。

---

## 🧰 常用命令

| 命令 | 作用 |
|---|---|
| `fastcode` | 进入 TUI |
| `fastcode "解释这个仓库"` | 带初始问题启动 |
| `fastcode doctor` | 环境自检 —— **排障先跑这个** |
| `fastcode provider` / `fastcode model` | 列出 / 切换服务商与模型 |
| `fastcode config` | 查看配置内容与文件路径 |
| `fastcode sessions` / `fastcode resume latest` | 历史会话 / 恢复上次会话 |
| `fastcode trust` / `untrust` / `trusted` | 管理信任目录 |
| `fastcode update` | 检查新版本 |
| `fastcode --help` | 查看全部命令 |

界面内常用：`/help` · `/model` · `/provider` · `/effort` · `/login` · `/agent` · `/theme` · `/clear` · `/exit`

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
| 单按 Ctrl+C 就退出 | 已修复：单按只提示，再按一次才退（确认版本为 0.1.6） |
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
fastcode-portable-0.1.6.tar.gz       免安装便携包（自包含单文件）
fastcode-portable-0.1.6.zip          同上（需系统有 zip）
datename-fastcode-termux-0.1.6.tgz   npm 包（npm pack）
SHA256SUMS                           以上文件的校验和
```

### 发布 npm

设置仓库 Secret `NPM_TOKEN` 后，CI 会在推送 `v*` tag 时自动 `npm publish`
（见 `.github/workflows/release.yml`）。手动兜底：

```bash
cd package
npm publish --access public
```

### GitHub Releases

推荐用 CI 自动发布（`.github/workflows/release.yml`）：打 tag 即可

```bash
git tag v0.1.6
git push origin v0.1.6        # 触发 Actions：构建 + 打包 + 上传 Release
```

也可手动：

```bash
gh release create v0.1.6 -t "FastCode 0.1.6" \
  release/fastcode-portable-0.1.6.tar.gz \
  release/datename-fastcode-termux-0.1.6.tgz \
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
| [docs/DEVLOG.md](docs/DEVLOG.md) | 0.1.6-beta 改动日志、迁移、风险与回滚 |
| [LOCALIZATION_REPORT.md](LOCALIZATION_REPORT.md) | 0.1.6-beta 交接报告 |
| [CHANGELOG.md](CHANGELOG.md) | 分版本更新日志（0.1.6） |
| [PATCHES.md](PATCHES.md) | 到 0.1.6 为止的 36 项修复清单 |

---

## ℹ️ 关于本项目

- 上游源码仓库 `github.com/SimpleLittleDev/FastCode`，npm 上最后一版是 0.1.3。
  本仓库在其编译产物上修复 + 手机适配，并已逆向重建 TypeScript 源码（`package/src`）。

---

## 🙏 致谢

本项目是站在他人肩膀上的二次修复与适配，特别感谢：

- **SimpleLittleDev** —— 原始 FastCode TUI 的作者。本项目基于其 npm 包
  [`@simplelittledev/fastcode`](https://www.npmjs.com/package/@simplelittledev/fastcode)（0.1.3）
  的编译产物进行修复与手机适配，npm 上的贡献与荣誉归其所有。

- 以及全部上游开源依赖的作者：Ink、React、meow、cfonts、marked、chalk 等。

原始作者署名与上游项目名称、版权归各自所有；本仓库仅做修复与 Termux 适配。

<sub>Made for Termux 🐧📱 · FastCode 0.1.6</sub>
