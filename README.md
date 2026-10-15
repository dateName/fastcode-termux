# ⚡ FastCode — Termux / Android build

> **An AI coding assistant that lives in your phone's terminal.**
> 13 model providers · reads and writes files, runs commands, searches code · unzip and run.

**中文文档 → [README.zh.md](README.zh.md)**

|  |  |
|---|---|
| Version | **0.1.6** |
| Requires | Node.js ≥ 18.17 |
| Command | `fastcode` (short alias `fc`) |
| Data dir | `~/.fastcode` (override with `FASTCODE_HOME`) |

---

## 🚀 Quick start (30 seconds)

```bash
# 1) install Node
pkg install -y nodejs

# 2) unpack the portable bundle (dependencies included, no npm install)
tar -xzf fastcode-portable-0.1.6.tar.gz
cd fastcode-portable-0.1.6 && chmod +x fastcode

# 3) set a key and run
export DEEPSEEK_API_KEY=sk-your-key
./fastcode
```

> 💡 DeepSeek is a good default: cheap and strong at Chinese. Claude, OpenAI, Gemini, Qwen, GLM, Kimi and Grok also work.
>
> 🔒 The first time you enter a folder, FastCode asks whether to trust it (the agent can read/write files and run commands). Press `y`.

---

## 📦 Install (pick one)

| Option | Best for | How |
|---|---|---|
| **A. Portable bundle** ⭐ | phones, zero fuss | unpack, run `./fastcode` — **no npm needed** |
| **B. npm, from this repo** | any machine with npm | `npm install -g ./package` |
| **C. tarball** | shipping a single file | `npm install -g ./simplelittledev-fastcode-0.1.6.tgz` |
| **D. Git clone** | your own fork | `git clone https://github.com/dateName/fastcode-termux ~/fastcode && npm install -g ~/fastcode/package` |

---

## 🔑 API keys

Pick **one** provider and export its key:

| Provider | Environment variable | Note |
|---|---|---|
| **DeepSeek** ⭐ | `DEEPSEEK_API_KEY` | cheap, good Chinese |
| Anthropic | `ANTHROPIC_API_KEY` | Claude |
| OpenAI | `OPENAI_API_KEY` | GPT |
| Google | `GEMINI_API_KEY` | Gemini |
| Qwen | `DASHSCOPE_API_KEY` | DashScope |
| Zhipu | `ZHIPUAI_API_KEY` | GLM |
| Moonshot | `MOONSHOT_API_KEY` | Kimi |
| xAI | `XAI_API_KEY` | Grok |
| OpenRouter | `OPENROUTER_API_KEY` | 400+ models, one key |
| Groq / Mistral | `GROQ_API_KEY` / `MISTRAL_API_KEY` | fast / EU |
| Ollama | none | local, free |
| Custom | `FASTCODE_BASE_URL` + `FASTCODE_API_KEY` | any OpenAI-compatible endpoint |

Persist it:

```bash
echo 'export DEEPSEEK_API_KEY=sk-your-key' >> ~/.bashrc
```

Or log in from the TUI (the key is masked and never echoed into the transcript):

```text
/login deepseek <your key>
```

---

## 🤖 Choosing the main model (three equivalent ways)

| Way | How | Best for |
|---|---|---|
| 📝 Edit the file | `nano ~/.fastcode/config.json` | you like editing files |
| ⌨️ CLI | `fastcode model deepseek-chat` | no TUI needed |
| 💬 In the TUI | `/model deepseek-chat` | while chatting |

```json
{
  "providerId": "deepseek",
  "model": "deepseek-chat"
}
```

> 🔐 **Keys live in a separate file**, `~/.fastcode/auth.json`. Changing the model never touches them.

Useful commands:

```bash
fastcode provider            # list providers
fastcode provider deepseek   # switch provider (with its default model)
fastcode model               # list models for the current provider
fastcode model deepseek-chat # switch model only
fastcode config              # show config and file paths
```

---

## ✨ What it does

| Feature | Description |
|---|---|
| 💬 Multi-model chat | 13 providers, switch with `/provider` and `/model` |
| 🛠️ Local coding agent | read/write files, grep, patch, run shell commands (on by default) |
| 🔎 Code navigation | search a project, locate by structure, batch-read files |
| 🧩 Agent Skills | install SKILL.md skills to extend behaviour |
| 🎨 Themes | `/theme` |
| 💰 Usage | token and cost readout in the status bar |

---

## 🛡️ Safety and reliability (new in 0.1.6)

| Capability | Behaviour | Override |
|---|---|---|
| 🔒 Project trust | first run in an unknown folder asks before agent tools load | `fastcode trust` / `untrust` / `trusted`; `FASTCODE_TRUST_ALL=1` |
| 🚫 Dangerous-command guard | `rm -rf`, `dd`, `mkfs`, fork bombs are refused **before** execution | `FASTCODE_ALLOW_DANGEROUS=1` |
| ✂️ Unified output cap | output is truncated while produced (default 30000 chars) | `FASTCODE_TOOL_OUTPUT_LIMIT` |
| 💾 Session log | append-only JSONL, survives a crash | `fastcode sessions` / `fastcode resume`; cache cap 64 MB |

The dangerous-command deny list is ported from HKUDS/FastCode nanobot (`nanobot/agent/tools/shell.py`).

---

## 📱 Termux tips

| Problem | Do this |
|---|---|
| screen lock kills the session | `termux-wake-lock` (release with `termux-wake-unlock`) |
| no Esc key | add an extra-keys row in `~/.termux/termux.properties`, then `termux-reload-settings` |
| flickering UI | stable UI is automatic on Termux; force with `export FASTCODE_STABLE_UI=1` |
| shared storage | `~/storage/shared` is allowed by default; disable with `FASTCODE_ALLOW_SHARED_STORAGE=0` |
| typing Chinese is awkward | put the prompt in a file, then `fastcode "read prompt.txt and do what it says"` |

---

## 🧰 Command reference

| Command | Purpose |
|---|---|
| `fastcode` | open the TUI |
| `fastcode doctor` | environment self-check — **start here when debugging** |
| `fastcode update` | check for a newer release |
| `fastcode sessions` | list saved sessions |
| `fastcode resume latest` | resume the last session |
| `fastcode trust / untrust / trusted` | manage trusted folders |
| `fastcode --help` | all commands |

Inside the TUI: `/help` · `/model` · `/provider` · `/login` · `/agent` · `/theme` · `/clear` · `/exit`

---

## 🔄 Update and uninstall

```bash
cd ~/fastcode && git pull && npm install -g ./package   # from a clone
npm install -g @simplelittledev/fastcode@latest         # from npm
fastcode update                                          # check version

npm uninstall -g @simplelittledev/fastcode
rm -rf ~/.fastcode        # optional: config, keys, skills
```

---

## ❓ FAQ

| Symptom | Cause / fix |
|---|---|
| "requires a TTY" | run it in a real terminal; pipes and some remote tools trigger this |
| one Ctrl+C exits | fixed: it only warns, press twice to quit. You need 0.1.6 |
| no API key | run `fastcode doctor`, then `/login` or export the variable |
| `/skills search` returns nothing | the default registry is paid/upstream; drop a SKILL.md into `~/.fastcode/skills/<name>/` |
| slow install | switch mirror: `npm config set registry https://registry.npmmirror.com` |
| command blocked | that is the safety guard; override with `FASTCODE_ALLOW_DANGEROUS=1` |

---

## 📚 Documentation

| File | Contents |
|---|---|
| [README.zh.md](README.zh.md) | Chinese user guide |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | all deployment methods (macOS, Windows, Termux) |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | config.json / auth.json, every environment variable |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | architecture, modules, data flow, extension points |
| [docs/MODULES.md](docs/MODULES.md) | what every source file does |
| [docs/AUDIT.md](docs/AUDIT.md) | security and robustness audit |
| [PATCHES.md](PATCHES.md) | all 22 fixes up to 0.1.6 |

---

## ℹ️ About this build

- The original upstream repository (`SimpleLittleDev/FastCode`) was deleted; npm's last release is 0.1.3.
  This repo is a fix + Termux adaptation built on that compiled artifact, with the TypeScript source
  reverse-engineered into `package/src` (`npm run build` rebuilds `dist`).
- `HKUDS/FastCode` is a different Python project (code understanding) and is **not** the upstream of this TUI.
- The dangerous-command rules are ported from HKUDS/FastCode nanobot.

<sub>Made for Termux 🐧📱 · FastCode 0.1.6</sub>
