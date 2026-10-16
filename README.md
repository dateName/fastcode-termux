# ⚡ FastCode — Termux / Android build

> **An AI coding assistant that lives in your phone's terminal.** Optimised for Termux / Android; one-line install from the GitHub repo.

| | |
|---|---|
| Version | **0.1.4** |
| Command | `fastcode` (short alias `fc`) |
| Data dir | `~/.fastcode` (override with `FASTCODE_HOME`) |
| Repo | https://github.com/dateName/fastcode-termux |

**中文文档 → [README.zh.md](README.zh.md)**

---

## 📖 What is it

FastCode is a multi-model **AI coding assistant** that runs in your terminal (TUI).
It connects to your favourite provider and works like an agent — it **reads files, edits
files, runs commands and searches code** — and supports Agent Skills.

This repo fixes and adapts the deleted upstream `SimpleLittleDev/FastCode` 0.1.3 build for
mobile, and the TypeScript source has been reverse-engineered into `package/src`
(`npm run build` rebuilds `dist`).

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 AI chat coding | Conversational coding right in the terminal, streamed |
| 📂 Read / write files | read, write, append, patch, replace — sandboxed to the current directory |
| ⚙️ Run commands | execute shell commands and return output; `rm -rf`, `dd`, `mkfs`, fork bombs are **blocked before execution** |
| 🔎 Code search | grep, structure lookup, batch file reads |
| 🤖 Multi-provider | **DeepSeek / OpenAI / Anthropic**, plus Gemini, Qwen, GLM, Kimi, Grok, OpenRouter, Ollama — 13 providers |
| 🧩 Agent Skills | install `SKILL.md` skills to extend behaviour |
| 🎨 Themes | `/theme` |
| 💰 Usage | token and cost readout in the status bar |

**Key bindings**

| Key | Action |
|---|---|
| `Ctrl+C` | quit (press twice; a single press only warns) |
| `Esc` | cancel the current thought / stream |

---

## 💻 Requirements

| Item | Requirement |
|---|---|
| Node.js | ≥ 18.17 (check with `node -v`) |
| git | needed by the one-line script / manual clone |
| OS | Termux (Android) / Linux / macOS / Windows |
| Arch | aarch64 / armv7 / x86_64 all work; if you hit a binary mismatch, use the **from-source** install |

Termux: install deps and grant storage access:

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git ca-certificates
termux-setup-storage     # so the agent can reach ~/storage/shared (phone projects/downloads/photos)
```

---

## 📦 Install

In order of preference:

### 1. One-line script (recommended, straight from the GitHub repo)

```bash
curl -fsSL https://raw.githubusercontent.com/dateName/fastcode-termux/main/scripts/install.sh | bash
```

The script installs Node/git, shallow-clones the repo, installs `fastcode` globally and self-checks.

Flags:

```bash
bash scripts/install.sh --dir ~/fastcode     # custom clone directory
bash scripts/install.sh --repo <url>         # another repo / fork
bash scripts/install.sh --branch dev         # pick a branch
bash scripts/install.sh --no-global          # local npm install only
```

### 2. npm

```bash
npm install -g @simplelittledev/fastcode
```

### 3. Manual clone

```bash
git clone --depth 1 https://github.com/dateName/fastcode-termux.git ~/fastcode
cd ~/fastcode
bash scripts/install.sh          # or: npm install -g ./package
```

### 4. Portable bundle (optional — upload to Releases first)

Download `fastcode-portable-0.1.4.tar.gz` (or `.zip`; see `SHA256SUMS`) from Releases,
unpack and run — **no npm needed**:

```bash
tar -xzf fastcode-portable-0.1.4.tar.gz
cd fastcode-portable-0.1.4 && chmod +x fastcode
./fastcode
```

> No bundle uploaded yet? Build your own — see [Maintainers](#-maintainers).

---

## 🚀 Quick start

```bash
# 1) set a key (add to ~/.bashrc to persist)
export DEEPSEEK_API_KEY=sk-your-key

# 2) run
fastcode
```

> 💡 DeepSeek is a good default: cheap and strong at Chinese. Claude, OpenAI, Gemini, Qwen, GLM, Kimi and Grok also work.
>
> 🔒 The first time you enter a folder, FastCode asks whether to trust it (the agent can read/write files and run commands). Press `y`.
>
> 📱 On Termux: run `termux-setup-storage` first, and `termux-wake-lock` to keep the session alive.

---

## 🔑 Configure API key

Pick **one** provider and export its key:

| Provider | Environment variable |
|---|---|
| **DeepSeek** ⭐ | `DEEPSEEK_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google | `GEMINI_API_KEY` |
| Qwen | `DASHSCOPE_API_KEY` |
| Zhipu | `ZHIPUAI_API_KEY` |
| Moonshot | `MOONSHOT_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Groq / Mistral | `GROQ_API_KEY` / `MISTRAL_API_KEY` |
| Ollama | none (local, free) |
| Custom | `FASTCODE_BASE_URL` + `FASTCODE_API_KEY` |

**Persist it in `~/.bashrc`:**

```bash
echo 'export DEEPSEEK_API_KEY=sk-your-key' >> ~/.bashrc
```

**Or** log in from the TUI (the key is masked as `********` and never echoed into the transcript):

```text
/login deepseek <your key>
```

> 🔐 Keys live in a separate file, `~/.fastcode/auth.json`, apart from `config.json`. Changing the model never touches them.

---

## 🧰 Commands

| Command | Purpose |
|---|---|
| `fastcode` | open the TUI |
| `fastcode "explain this repo"` | start with an initial prompt |
| `fastcode doctor` | environment self-check — **start here when debugging** |
| `fastcode provider` / `fastcode model` | list / switch provider and model |
| `fastcode config` | show config and file paths |
| `fastcode sessions` / `fastcode resume latest` | list sessions / resume the last one |
| `fastcode trust` / `untrust` / `trusted` | manage trusted folders |
| `fastcode update` | check for a newer release |
| `fastcode --help` | all commands |

Inside the TUI: `/help` · `/model` · `/provider` · `/login` · `/agent` · `/theme` · `/clear` · `/exit`

---

## ❓ FAQ

| Symptom | Cause / fix |
|---|---|
| Slow install / hangs | switch mirror: `npm config set registry https://registry.npmmirror.com` |
| Permission error / can't see phone files | run `termux-setup-storage`; make sure `~/storage/shared` exists |
| Arch mismatch / native module error | use the **from-source** install (option 3) so deps rebuild locally |
| Invalid API key | run `fastcode doctor`; check the env var name/value, or `/login` again |
| How to update | repo install: `bash ~/fastcode/scripts/install.sh`; npm: `npm i -g @simplelittledev/fastcode@latest` |
| "requires a TTY" | run in a real terminal; pipes and some remote tools trigger this |
| One Ctrl+C exits | fixed: it only warns, press twice to quit (make sure you're on 0.1.4) |
| Command blocked | that's the safety guard; override with `FASTCODE_ALLOW_DANGEROUS=1` |

---

## 🗑️ Uninstall

```bash
npm uninstall -g @simplelittledev/fastcode
rm -rf ~/fastcode        # clone dir (optional)
rm -rf ~/.fastcode       # config, keys, skills, sessions (optional)
```

Portable bundle: just delete the unpacked directory.

---

## 🏗️ Maintainers

### Release a new version

1. Bump `version` in `package/package.json`.
2. Rebuild: `npm run build` (generates `dist` from `src`).
3. Produce and upload the artifacts below.

### Build the portable bundle

```bash
sh scripts/build-portable.sh
```

Artifacts land in `release/`:

```text
fastcode-portable-0.1.4.tar.gz       self-contained bundle (deps included)
fastcode-portable-0.1.4.zip          same (needs the `zip` command)
simplelittledev-fastcode-0.1.4.tgz   npm package (npm pack)
SHA256SUMS                           checksums
```

### Publish to npm

```bash
cd package
npm publish --access public
```

### GitHub Releases

```bash
gh release create v0.1.4 -t "FastCode 0.1.4" \
  release/fastcode-portable-0.1.4.tar.gz \
  release/simplelittledev-fastcode-0.1.4.tgz \
  release/SHA256SUMS
```

### package.json essentials

```json
{
  "bin": { "fastcode": "bin/fastcode.mjs", "fc": "bin/fastcode.mjs" },
  "files": ["bin", "dist", "src", "tsconfig.json", "assets", "README.md", "LICENSE"]
}
```

### Documentation

| File | Contents |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | all deployment methods and troubleshooting |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | the two config files, every environment variable |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | architecture, modules, data flow |
| [docs/MODULES.md](docs/MODULES.md) | what every source file does |
| [docs/AUDIT.md](docs/AUDIT.md) | security and robustness audit |
| [PATCHES.md](PATCHES.md) | all 22 fixes up to 0.1.4 |

---

## ℹ️ About this build

- The original upstream repository (`SimpleLittleDev/FastCode`) was deleted; npm's last release is 0.1.3.
  This repo fixes and adapts that compiled artifact for mobile, with the TypeScript source reverse-engineered into `package/src`.
- `HKUDS/FastCode` is a different Python project (code understanding) and is **not** the upstream of this TUI.
- The dangerous-command rules are ported from HKUDS/FastCode nanobot.

<sub>Made for Termux 🐧📱 · FastCode 0.1.4</sub>
