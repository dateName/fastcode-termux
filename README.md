# ⚡ FastCode — Termux / Android build

> **An AI coding assistant that lives in your phone's terminal.** Optimised for Termux / Android; one-line install from the GitHub repo.

| | |
|---|---|
| Version | **0.1.6-beta** (test build) |
| Command | `fastcode` (short alias `fc`) |
| Data dir | `~/.fastcode` (override with `FASTCODE_HOME`) |
| Repo | https://github.com/dateName/fastcode-termux |

**中文文档 → [README.zh.md](README.zh.md)**

---

## 📖 What is it

FastCode is a multi-model **AI coding assistant** that runs in your terminal (TUI).
It connects to your favourite provider and works like an agent — it **reads files, edits
files, runs commands and searches code** — and supports Agent Skills.

This repo fixes and adapts the upstream `SimpleLittleDev/FastCode` 0.1.3 build for
mobile, and the TypeScript source has been reverse-engineered into `package/src`
(`npm run build` rebuilds `dist`).

The shipped artifact is a **self-contained single file** `package/dist/cli.js` (esbuild inlines
Ink/React/meow), so a plain `git clone` runs **without `npm install`**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 Multi-model chat | **13 providers**, switch with `/provider` and `/model` |
| 🛠️ Local coding agent | read/write files, grep, patch, run shell commands (on by default) |
| 🔎 Code navigation | search a project, locate by structure, batch-read files |
| 🧩 Agent Skills | install `SKILL.md` skills to extend behaviour |
| 🧠 Thinking effort | `/effort auto/low/medium/high/max`, shown in the status bar |
| 🎨 Themes | `/theme` |
| 💰 Usage | token and cost readout in the status bar |
| 🤖 Model support | **DeepSeek / OpenAI / Anthropic**, plus Gemini, Qwen, GLM, Kimi, Grok, OpenRouter, Ollama |
| 💾 Resume & facts | append-only facts + `*.projection.json`; resume restores cwd/provider/model and unpaired tool calls |
| 🧠 Context control | `/context`, `/compact`, token/HEAP-triggered local compaction with `summary-*.md` |
| 🖥️ Background shell | long commands return a session id; `/jobs` `/attach` `/kill`, resident `sh -s` pool |
| 🧰 Dual tool protocol | pseudo `<fastcode_tool>` or native `tool_calls`; `FASTCODE_TOOL_PROTOCOL=legacy|native|auto` |
| 📱 Mobile commands | `/cancel` `/steer` `/expand` `/edit` (external editor for IME issues) |

**Key bindings**

| Key | Action |
|---|---|
| `Ctrl+C` | quit (press twice; a single press only warns) |
| `Esc` | cancel the current thought / stream |

---

## 🛡️ Safety and reliability

| Capability | Behaviour | Override |
|---|---|---|
| 🔒 Project trust | first run in an unknown folder asks before agent tools load | `fastcode trust` / `untrust` / `trusted`; `FASTCODE_TRUST_ALL=1` |
| 🧱 File sandbox | file tools stay inside the project; `../` and symlink escapes are rejected | `config.sharedDirs`, `FASTCODE_ALLOW_PATHS` |
| 🚫 Dangerous-command guard | `rm -rf`, `dd`, `mkfs`, fork bombs are refused **before** execution | `FASTCODE_ALLOW_DANGEROUS=1` |
| ✂️ Unified output cap | output is truncated while produced (default 30000 chars) | `FASTCODE_TOOL_OUTPUT_LIMIT` |
| 💾 Session log | append-only JSONL, survives a crash | `fastcode sessions` / `fastcode resume`; cache cap **256MB** |
| 🧾 Patch transaction | parse → plan → apply; CRLF/mode preserved; symlinks refused; move never overwrites | `/expand` for full diff |
| 🛑 Process tree | abort/`/kill` kills children and grandchildren | POSIX process group; Windows `taskkill /T` |
| 🔐 Approval hook | sensitive/large patches require approval; no resolver = **deny** (fail closed) | pending UI is not implemented yet |

### Known limitations (0.1.6-beta)

- Ink 5.x IME cursor placement is not fully fixed; a stale Termux pty size can clip/reorder text (`abcdef` → `bcdefa`).
  Correct the pty with `stty`, or use `/edit`; a full fix needs Ink ≥6.7.
- Three `string-width` versions may disagree on ambiguous-width characters.
- Native tools cover OpenAI-compatible providers only; others use the pseudo protocol.
- Approval pending has no TUI resolver yet, so those operations are denied.

---

## 💻 Requirements

| Item | Requirement |
|---|---|
| Node.js | ≥ 18.17 (check with `node -v`) |
| git | needed by method 1 / 3 (portable bundle does not need it) |
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

In order of preference. The repo commits a **self-contained bundle** `package/dist/cli.js` (esbuild inlines Ink/React/meow, so no `npm install` is needed after cloning).

> ⚠️ **Don't just `git clone` and run** `node package/bin/fastcode.mjs`: that's fine when `package/dist/cli.js` is present, but if it's missing (or you have an old tree) use one of the methods below instead.

### 1. One-line script (recommended)

```bash
git clone https://github.com/dateName/fastcode-termux.git
cd fastcode-termux
bash scripts/install.sh
fastcode          # ready to go (short alias: fc)
```

The script symlinks `package/dist/cli.js` into `$PREFIX/bin` (Termux) or `~/.local/bin`, **skipping `npm install` entirely**; it only falls back to `npm install && npm run build` if the bundle is missing.

### 2. Portable bundle (no npm)

Download the latest `fastcode-portable-0.1.6-beta.tar.gz` (see `SHA256SUMS`) from Releases, unpack and run:

```bash
tar -xzf fastcode-portable-0.1.6-beta.tar.gz
cd fastcode-portable-0.1.6-beta
./fastcode
```

The 0.1.6-beta bundle is committed under `release/` and attached to the GitHub Release.
Rebuild it with `sh scripts/build-portable.sh`.

### 3. From source (only if you want to modify or rebuild)

You do **not** need this to use FastCode — the committed bundle already runs
(see above). Use it when you change `package/src` or want a local rebuild:

```bash
git clone https://github.com/dateName/fastcode-termux.git
cd fastcode-termux/package
npm install          # needed only to rebuild / run the TypeScript source
npm run build        # regenerates dist/ from src/
npm link             # then `fastcode` / `fc` are global
```

To just run the committed bundle from a checkout, no install is required:

```bash
node package/dist/cli.js          # or: node package/bin/fastcode.mjs doctor
```

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

**Or** bind a key from the TUI. Keys are scoped to the provider, so every model of that provider reuses it; the input is masked:

```text
/login                                      # guided: provider → model → key (masked)
/login deepseek deepseek-chat sk-your-key   # or on one line
```

Every save echoes **provider · scope (all its models) · key tail (`sk-****abcd`) · file**.

> 🔐 Keys live in `~/.fastcode/auth.json`, **one key per provider**, separate from `config.json`. Switching models inside a provider reuses the same key. v1/v2 files are migrated automatically on first read and backed up as `auth.json.v2.bak` — see [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Env vars (`DEEPSEEK_API_KEY`, …) are also provider-wide.

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

Inside the TUI: `/help` · `/model` · `/provider` · `/effort` · `/login` · `/agent` · `/theme` · `/clear` · `/exit`

---

## ❓ FAQ

| Symptom | Cause / fix |
|---|---|
| `ERR_MODULE_NOT_FOUND` right after `git clone` | you're on an unpacked/old tree. Run `bash scripts/install.sh`; when `dist/cli.js` is present you can also just run `node package/dist/cli.js`. Only method 3 needs `npm install` |
| Slow `npm install` / hangs (method 3 only) | switch mirror: `npm config set registry https://registry.npmmirror.com` |
| Permission error / can't see phone files | run `termux-setup-storage`; make sure `~/storage/shared` exists |
| Arch mismatch / native module error | use the **from-source** install (option 3) so deps rebuild locally |
| Invalid API key | run `fastcode doctor`; check the env var name/value, or `/login` again |
| How to update | `cd ~/fastcode && git pull && bash scripts/install.sh` (install.sh alone does not pull) |
| npm install gives old/broken behavior | the npm registry can lag the repo — prefer the clone or the portable bundle for now; `fastcode update` compares versions |
| "requires a TTY" | run in a real terminal; pipes and some remote tools trigger this |
| One Ctrl+C exits | fixed: it only warns, press twice to quit (make sure you're on 0.1.6-beta) |
| Command blocked | that's the safety guard; override with `FASTCODE_ALLOW_DANGEROUS=1` |

---

## 🗑️ Uninstall

```bash
npm uninstall -g @datename/fastcode-termux
rm -rf ~/fastcode        # clone dir (optional)
rm -rf ~/.fastcode       # config, keys, skills, sessions (optional)
```

Portable bundle: just delete the unpacked directory.

---

## 🏗️ Maintainers

### Build the self-contained bundle

Source lives in `package/src`; esbuild bundles it into the single file `package/dist/cli.js`:

```bash
cd package
npm install
npm run build          # = tsc (types/multi-file) + node scripts/build.mjs (esbuild bundle)
npm run build:bundle   # esbuild only (add --no-minify for a readable build)
```

> `dist/cli.js` must be committed — it's what makes `git clone` run without `npm install`.

### Release a new version

1. Bump `version` in `package/package.json`.
2. `cd package && npm run build` to regenerate and commit `dist/cli.js`.
3. Push a tag; GitHub Actions builds and uploads the Release (below).
4. Or produce and upload the artifacts manually.

### Build the portable bundle

```bash
sh scripts/build-portable.sh
```

Artifacts land in `release/`:

```text
fastcode-portable-0.1.6-beta.tar.gz       self-contained single-file bundle
fastcode-portable-0.1.6-beta.zip          same (needs the `zip` command)
datename-fastcode-termux-0.1.6-beta.tgz   npm package (npm pack)
SHA256SUMS                           checksums
```

### Publish to npm

CI publishes to npm automatically on a `v*` tag when the repo secret
`NPM_TOKEN` is set (see `.github/workflows/release.yml`). Manual fallback:

```bash
cd package
npm publish --access public --tag beta
```

### GitHub Releases

CI publishes automatically (`.github/workflows/release.yml`) — just push a tag:

```bash
git tag v0.1.6-beta
git push origin v0.1.6-beta        # Actions: build + package + upload Release
```

Or manually:

```bash
gh release create v0.1.6-beta -t "FastCode 0.1.6-beta" \
  release/fastcode-portable-0.1.6-beta.tar.gz \
  release/datename-fastcode-termux-0.1.6-beta.tgz \
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
| [docs/DEVLOG.md](docs/DEVLOG.md) | 0.1.6-beta change log: data migrations, risks, rollback |
| [LOCALIZATION_REPORT.md](LOCALIZATION_REPORT.md) | 0.1.6-beta handover report |
| [CHANGELOG.md](CHANGELOG.md) | release notes (0.1.6-beta) |
| [PATCHES.md](PATCHES.md) | 36 upstream fixes + 0.1.6-beta harness |

---

## ℹ️ About this build

- The upstream repository is `SimpleLittleDev/FastCode`; npm's last release is 0.1.3.
  This repo fixes and adapts that compiled artifact for mobile, with the TypeScript source reverse-engineered into `package/src`.

---

## 🙏 Credits

This project is a fix + Termux adaptation that stands on other people's work. Thanks to:

- **SimpleLittleDev** — author of the original FastCode TUI. This repo is a fix + mobile
  adaptation built on the compiled artifact of the npm package
  [`@simplelittledev/fastcode`](https://www.npmjs.com/package/@simplelittledev/fastcode) (0.1.3);
  credit for the npm package belongs to them.

Original author credits, upstream project names and copyrights remain the property of their
respective owners; this repo only fixes and adapts for Termux.

<sub>Made for Termux 🐧📱 · FastCode 0.1.6-beta</sub>
