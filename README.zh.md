# ⚡ FastCode 手机版

> **装在手机终端里的 AI 编程助手** —— 为 Termux / Android 优化
> 13 个模型服务商 · 能读写文件、跑命令、查代码 · 解压即用

| 项目 | 说明 |
|---|---|
| 版本 | **0.1.6** |
| 需要 | Node.js ≥ 18.17 |
| 命令 | `fastcode`（短别名 `fc`） |
| 数据目录 | `~/.fastcode`（可用 `FASTCODE_HOME` 改） |

---

## 🚀 30 秒上手

```bash
# 1) 装 Node
pkg install -y nodejs

# 2) 解压便携包（已内含依赖，不用 npm install）
tar -xzf fastcode-portable-0.1.6.tar.gz
cd fastcode-portable-0.1.6
chmod +x fastcode

# 3) 配一把 Key 并启动
export DEEPSEEK_API_KEY=sk-你的key
./fastcode
```

> 💡 推荐 DeepSeek：便宜、中文好。也可用 Claude、OpenAI、Gemini、通义千问、GLM、Kimi、Grok 等。
>
> 🔒 第一次进入某个目录时，FastCode 会问一次是否信任它（因为 agent 能读写文件和执行命令），按 `y` 即可。

---

## 📦 安装（四种方式，选一种）

| 方式 | 适合谁 | 怎么做 |
|---|---|---|
| **A. 免安装便携包** ⭐ | 手机用户、不想折腾 | 解压后跑 `./fastcode`，**不需要 npm** |
| **B. npm 本地安装** | 机器上已有 npm | `npm install -g ./package` |
| **C. tarball** | 只想传一个文件 | `npm install -g ./simplelittledev-fastcode-0.1.6.tgz` |
| **D. Git 仓库** | 想自己维护 | `git clone 你的仓库 && npm install -g ./package` |

一键脚本（Termux）：

```bash
bash scripts/install-termux.sh                    # 装 ~/fastcode/package
bash scripts/install-termux.sh /path/to/package   # 指定目录
```

---

## 🔑 配置 API Key

任选**一个**服务商，把 Key 放进环境变量：

| 服务商 | 环境变量 | 一句话 |
|---|---|---|
| **DeepSeek** ⭐ | `DEEPSEEK_API_KEY` | 便宜、中文好 |
| Anthropic | `ANTHROPIC_API_KEY` | Claude 系列 |
| OpenAI | `OPENAI_API_KEY` | GPT 系列 |
| Google | `GEMINI_API_KEY` | Gemini 系列 |
| 通义千问 | `DASHSCOPE_API_KEY` | 国内直连 |
| 智谱 GLM | `ZHIPUAI_API_KEY` | 国内直连 |
| Moonshot | `MOONSHOT_API_KEY` | Kimi |
| xAI | `XAI_API_KEY` | Grok |
| OpenRouter | `OPENROUTER_API_KEY` | 一个 Key 用 400+ 模型 |
| Groq / Mistral | `GROQ_API_KEY` / `MISTRAL_API_KEY` | 快 / 欧洲 |
| Ollama | 不需要 Key | 本地跑，免费 |
| 自定义接口 | `FASTCODE_BASE_URL` + `FASTCODE_API_KEY` | 任何 OpenAI 兼容端点 |

**写进 `~/.bashrc`，重开终端也生效：**

```bash
echo 'export DEEPSEEK_API_KEY=sk-你的key' >> ~/.bashrc
```

**或者**启动后在界面里登录（自动打码成 ********，不会留在对话记录里）：

```text
/login deepseek <你的key>
```

---

## 🤖 选择主模型（三种方式，完全等价）

| 方式 | 怎么做 | 适合 |
|---|---|---|
| 📝 改文件 | `nano ~/.fastcode/config.json` | 喜欢直接编辑 |
| ⌨️ 命令行 | `fastcode model deepseek-chat` | 不想开 TUI |
| 💬 界面内 | `/model deepseek-chat` | 正在聊天时 |

config.json 只写想改的字段即可，其余自动用默认值：

```json
{
  "providerId": "deepseek",
  "model": "deepseek-chat"
}
```

> 🔐 **Key 是另一个文件** `~/.fastcode/auth.json`，和 config.json 分开存放；
> 换模型永远碰不到 Key。

不用开编辑器的常用命令：

```bash
fastcode provider            # 列出全部服务商
fastcode provider deepseek   # 切换服务商（带上它的默认模型）
fastcode model               # 列出当前服务商的可用模型
fastcode model deepseek-chat # 只换模型
fastcode config              # 看配置内容与文件路径
```

---

## ✨ 能做什么

| 功能 | 说明 |
|---|---|
| 💬 多模型对话 | 13 个服务商，随时用 `/provider`、`/model` 切换 |
| 🛠️ 本地编码 Agent | 读/写文件、grep、打补丁、执行命令（默认开启） |
| 🔎 代码导航 | 在项目里搜索、按结构定位、批量读文件 |
| 🧩 Agent Skills | 安装 SKILL.md 技能来扩展能力 |
| 🎨 主题配色 | `/theme` 切换 |
| 💰 用量统计 | 状态栏显示 token 与花费 |

---

## 🛡️ 安全与可靠（0.1.6 新增）

| 能力 | 行为 | 想调整就设 |
|---|---|---|
| 🔒 项目信任 | 首次进入陌生目录先问一次，同意后才启用 agent | `fastcode trust` / `untrust` / `trusted`；`FASTCODE_TRUST_ALL=1` 跳过 |
| 🚫 危险命令拦截 | `rm -rf`、`dd`、`mkfs`、fork bomb 等在**执行前**被拒 | `FASTCODE_ALLOW_DANGEROUS=1` 放行 |
| ✂️ 输出上限 | 边产边截断，默认 30000 字符，不会撑爆内存 | `FASTCODE_TOOL_OUTPUT_LIMIT` |
| 💾 会话落盘 | JSONL 逐行追加，崩溃也能恢复 | `fastcode sessions` / `fastcode resume`；缓存上限默认 64MB |

---

## 📱 手机使用技巧

| 问题 | 做法 |
|---|---|
| 怕锁屏被杀 | `termux-wake-lock`（结束用 `termux-wake-unlock`） |
| 没有 Esc 键 | 在 `~/.termux/termux.properties` 加下面一行，再跑 `termux-reload-settings` |
| 画面闪烁 | Termux 下自动开启稳定 UI；也可 `export FASTCODE_STABLE_UI=1` |
| 想用共享存储 | 默认可直接读写 `~/storage/shared`（即 `/storage/emulated/0`） |
| 想更严格 | `export FASTCODE_ALLOW_SHARED_STORAGE=0` |
| 不方便打中文 | 把要求写进文件，再跑 `fastcode "读取 prompt.txt 并按其中要求完成"` |

extra-keys 那一行：

```text
extra-keys = [['ESC','/','-','HOME','UP','END'],['TAB','CTRL','ALT','LEFT','DOWN','RIGHT']]
```

---

## 🧰 命令速查

| 命令 | 作用 |
|---|---|
| `fastcode` | 进入 TUI |
| `fastcode "解释这个仓库"` | 带初始问题启动 |
| `fastcode doctor` | 环境自检 —— **排障先跑这个** |
| `fastcode update` | 检查新版本 |
| `fastcode sessions` | 列出历史会话 |
| `fastcode resume latest` | 恢复上次会话 |
| `fastcode trust` / `untrust` / `trusted` | 管理信任目录 |
| `fastcode --help` | 查看全部命令 |

界面内常用：`/help` · `/model` · `/provider` · `/login` · `/agent` · `/theme` · `/clear` · `/exit`

---

## 🔄 更新与卸载

**更新**

```bash
cd ~/fastcode && npm install -g ./package          # 目录方式
npm install -g @simplelittledev/fastcode@latest    # npm 方式
fastcode update                                    # 检查版本
```

一键脚本：`bash scripts/update-termux.sh /path/to/package`

**卸载**

```bash
npm uninstall -g @simplelittledev/fastcode
rm -rf ~/.fastcode        # 可选：连配置、Key、技能一起删
```

> 📌 本目录是 **0.1.6**，比 npm 上的 0.1.3 新。继续用本地安装即可，别用 0.1.3 覆盖。

---

## ❓ 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 提示 requires a TTY | 要在**真实终端**里运行；管道或某些远程工具会这样，Termux 正常 |
| 单按 Ctrl+C 就退出 | 已修复：单按只提示，再按一次才退。确认用的是 0.1.6 |
| 提示没有 API Key | 跑 `fastcode doctor` 看缺哪个，再 `/login` 或设环境变量 |
| `/skills search` 没结果 | 默认技能市场需付费，属上游问题；可手动放 `~/.fastcode/skills/<名字>/SKILL.md` |
| 安装很慢 / 卡住 | 换镜像：`npm config set registry https://registry.npmmirror.com` |
| 命令被拦截 | 那是危险命令保护；确认无误可临时 `export FASTCODE_ALLOW_DANGEROUS=1` |

---

## 📂 文件都在哪

```text
~/.fastcode/
  config.json     服务商、模型、主题、启用的技能/插件
  auth.json       API Key（单独文件，权限 0600）
  trusted.json    已信任的目录
  sessions/       会话记录（JSONL，可以直接打开看）
  skills/         安装的技能
  plugins/        插件包
```

---

## 📚 想更深入

| 文档 | 内容 |
|---|---|
| docs/DEPLOYMENT.md | 全部部署方式（含 macOS / Windows）与排障 |
| docs/CONFIGURATION.md | 两个配置文件、全部环境变量、改模型方式 |
| docs/ARCHITECTURE.md | 架构、模块、数据流、扩展点、安全设计 |
| docs/MODULES.md | 每个文件干什么（改代码前先看） |
| docs/AUDIT.md | 安全审计结论与待办 |
| PATCHES.md | 到 0.1.6 为止的 22 项修复清单 |

---

## ℹ️ 关于本项目

- 官方源码仓库 `github.com/SimpleLittleDev/FastCode` 已被删除，npm 上最后一版是 0.1.3。
  本目录是在 0.1.3 的编译产物上修复 + 手机适配，并已**逆向重建出 TypeScript 源码**
  （`package/src`，跑 `npm run build` 可重新编译）。
- `github.com/HKUDS/FastCode` 是另一个 Python 项目（代码理解框架），与本 TUI 无关。
- 危险命令拦截的规则移植自 HKUDS/FastCode 的 nanobot。

---

<sub>Made for Termux 🐧📱 · FastCode 0.1.6</sub>
