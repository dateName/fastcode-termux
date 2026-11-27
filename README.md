# FastCode

> A terminal AI coding assistant for Termux/Android, Linux, macOS and Windows.

FastCode connects to your model provider and can read files, make edits, run shell commands and search code. The repo ships a self-contained `dist/cli.js`, so a clone runs without `npm install`.

| | |
|---|---|
| Command | `fastcode` (short alias `fc`) |
| Data dir | `~/.fastcode` (override with `FASTCODE_HOME`) |
| Source | https://github.com/dateName/fastcode-termux |
| Docs | [Configuration](docs/CONFIGURATION.md) · [Architecture](docs/ARCHITECTURE.md) · [Troubleshooting](RUNBOOK.md) |

**中文文档 → [README.zh.md](README.zh.md)**

---

## 📖 What is it

FastCode is a multi-model **AI coding assistant** that runs in your terminal (TUI).
It connects to your favourite provider and works like an agent — it **reads files, edits
files, runs commands and searches code** — and supports Agent Skills.

FastCode-Termux is maintained independently. The TypeScript source is tracked in
`package/src` (`npm run build` rebuilds `dist`).

The shipped artifact is a **self-contained single file** `package/dist/cli.js` (esbuild inlines
Ink/React/meow), so a plain `git clone` runs **without `npm install`**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 Multi-model chat | **55 providers** (13 built-in + 42 OpenAI-compatible catalog), switch with `/provider` and `/model` |
| 🛠️ Local coding agent | read/write files, grep, patch, run shell commands (on by default) |
| 🔎 Code navigation | search a project, locate by structure, batch-read files |
| 🧩 Agent Skills | install `SKILL.md` skills; directory sha256 locks with `/skills verify --confirm` re-baseline |
| 🧠 Thinking effort | `/effort auto/low/medium/high/max`, shown in the status bar |
| 🎨 Themes | `/theme` |
| 🌐 UI language | English / 简体中文 string catalog (`FASTCODE_LANG=zh` or `config.language`); covers banner, prompt, trust gate, pickers, status bar, activity labels, help/about and footer; most command output remains English |
| 💰 Usage | token and cost readout in the status bar |
| 🤖 Model support | **DeepSeek / OpenAI / Anthropic**, plus Gemini, Qwen, GLM, Kimi, Grok, OpenRouter, Ollama |
| 💾 Resume the real session | append-only facts + `*.projection.json`; `resume` restores cwd/provider/model, marks interrupted calls `INTERRUPTED`, and can recover projection-only sessions after JSONL pruning; headless logs by default |
| 🗜️ Compaction without losing decisions | `/context`, `/compact`, `/clear`; `/compact` or automatic token/heap compaction keeps decisions, files and recent turns in a summary while full history stays append-only |
| 🔍 Auditable diffs | edits are diffed against the full file, not a 16K prefix; distant changes stay separate hunks, large diffs cut at hunk boundaries, and `/expand <id>` replays the complete stored output/diff |
| 🛡️ Risk-based approval | sensitive paths, dangerous commands and large edits need approval; once/session/always, no resolver fails closed, Hard Block is not bypassed, and approval facts record their source |
| 🖥️ Background shell | long commands return a session id; `/jobs` `/attach` `/kill`; resident `sh -s` pool (default 2, up to 128 via `/threads`; one-shot commands use a separate per-turn spawn budget) |
| 🧰 Dual tool protocol | pseudo `<fastcode_tool>` or native `tool_calls` (default `auto`; native = OpenAI dialect, other providers fail closed to pseudo); `FASTCODE_TOOL_PROTOCOL=legacy|native|auto` |
| 📱 Mobile commands | `/cancel` `/steer` `/expand [id]` (reprint a stored tool result/diff) `/edit` (external editor for IME issues) |

**Key bindings**

| Key | Action |
|---|---|
| `Ctrl+C` | during a run: first cancels and keeps partial output, second quits; idle: first warns, second quits |
| `Esc` | cancel the current thought / stream; partial output is kept |

---

## Safety

FastCode can edit files and run commands, so these boundaries stay on by default:

- **Folder trust** — first run in a new folder asks for confirmation.
- **File sandbox** — file tools stay inside the project; `../` and symlink escapes are rejected.
- **Dangerous commands** — destructive commands, credential access and sensitive-data egress are blocked or sent for approval.
- **Approval** — sensitive or large edits require an approval; without a resolver they fail closed.
- **Output limits** — console and model output are capped to keep a runaway command from flooding the session.
- **Session recovery** — sessions are append-only JSONL and can be resumed after a crash.

Provider keys, custom paths and finer policy controls are documented in
[Configuration](docs/CONFIGURATION.md); implementation details are in
[Audit](docs/AUDIT.md) and [Error semantics](docs/ERROR_SEMANTICS.md).

### Notes

- On Termux, IME cursor placement can be affected by a stale pty size; `stty` or `/edit` usually fixes it.
- Native tool calls are used for OpenAI-compatible providers; others use the pseudo protocol.
- `/threads` controls the resident shell pool (1–128), not the global number of running commands.

---

## 💻 Requirements

| Item | Requirement |
|---|---|
| Node.js | ≥ 18.17 (check with `node -v`) |
| git | needed by method 1 / 3 (portable bundle does not need it) |
| OS | Termux (Android) / Linux / macOS / Windows |
| Arch | aarch64 / armv7 / x86_64 all work; if you hit a binary mismatch, use the **from-source** install |

Termux: install deps and grant storage access.

Update packages:

```bash
pkg update -y && pkg upgrade -y
```

Install Node.js, git and CA root certificates (`ca-certificates`):

```bash
pkg install -y nodejs git ca-certificates
```

Grant storage access so the agent can reach `~/storage/shared`:

```bash
termux-setup-storage
```

`ca-certificates` is the CA root bundle used by Node/npm/git to verify HTTPS connections to npm, GitHub and model APIs. Without a usable CA bundle you may see `certificate verify failed`, `unable to get local issuer certificate` or `self-signed certificate`.

If your Termux already has a working CA bundle and you do **not** want to install the package explicitly, install only Node.js and git:

```bash
pkg install -y nodejs git
```

Check HTTPS from Node:

```bash
node -e "fetch('https://registry.npmjs.org/').then((r) => console.log(r.status)).catch((e) => { console.error(e.message); process.exit(1); })"
```

If that fails, install `ca-certificates` or point Node/npm at a CA file. Do **not** disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED=0` / `strict-ssl=false`) as a workaround.

---

## 📦 Install

In order of preference. The repo commits a **self-contained bundle** `package/dist/cli.js` (esbuild inlines Ink/React/meow, so no `npm install` is needed after cloning).

Install the stable channel from npm:

```bash
npm install -g @datename/fastcode-termux@latest
```

`latest` is the stable channel; `beta` is the pre-release channel. The tracked `release/` contains historical published assets; current tag assets are built by the Release workflow.

> ⚠️ **Don't just `git clone` and run** `node package/bin/fastcode.mjs`: that's fine when `package/dist/cli.js` is present, but if it's missing (or you have an old tree) use one of the methods below instead.

### 1. One-line script (recommended)

Clone the repository:

```bash
git clone https://github.com/dateName/fastcode-termux.git
```

Enter the directory:

```bash
cd fastcode-termux
```

Install the launcher:

```bash
bash scripts/install.sh
```

Start FastCode:

```bash
fastcode
```

The short alias is `fc`.

The script symlinks `package/dist/cli.js` into `$PREFIX/bin` (Termux) or `~/.local/bin`, **skipping `npm install` entirely**; it only falls back to `npm install && npm run build` if the bundle is missing.

### 2. Portable bundle (no npm)

After the release build, download `fastcode-portable-<version>.tar.gz` (see `SHA256SUMS`).

Unpack it:

```bash
tar -xzf fastcode-portable-<version>.tar.gz
```

Enter the unpacked directory:

```bash
cd fastcode-portable-<version>
```

Run it:

```bash
./fastcode
```

The tracked `release/` contains historical published assets (currently 0.1.9-beta.1). `sh scripts/build-portable.sh` after `npm run build` generates `fastcode-portable-<version>.tar.gz|zip` and `datename-fastcode-termux-<version>.tgz` for the current `package.json` version; tagged releases are built in CI and uploaded to GitHub.

### 3. From source (only if you want to modify or rebuild)

You do **not** need this to use FastCode — the committed bundle already runs
(see above). Use it when you change `package/src` or want a local rebuild:

Clone the repository:

```bash
git clone https://github.com/dateName/fastcode-termux.git
```

Enter the package directory:

```bash
cd fastcode-termux/package
```

Install build dependencies:

```bash
npm install
```

Rebuild `dist/` from `src/`:

```bash
npm run build
```

Link the local build globally:

```bash
npm link
```

After linking, `fastcode` and `fc` are available globally.

To just run the committed bundle from a checkout, no install is required:

```bash
node package/dist/cli.js
```

You can also run a subcommand directly:

```bash
node package/bin/fastcode.mjs doctor
```

---

## 🚀 Quick start

Set a key (add it to `~/.bashrc` to persist):

```bash
export DEEPSEEK_API_KEY=sk-your-key
```

Start the TUI:

```bash
fastcode
```

> 💡 DeepSeek is a good default: cheap and strong at Chinese. Claude, OpenAI, Gemini, Qwen, GLM, Kimi and Grok also work.
>
> 🔒 The first time you enter a folder, FastCode asks whether to trust it (the agent can read/write files and run commands). Press `y`.
>
> 📱 On Termux: run `termux-setup-storage` first, and `termux-wake-lock` to keep the session alive.

---

## 🧩 Programmatic SDK (Node)

Use FastCode from your own Node program:

```ts
import { runTask } from "@datename/fastcode-termux";
import type { RunResult } from "@datename/fastcode-termux/types";

const handle = await runTask({ prompt: "summarize this repository", cwd: process.cwd() });
const result: RunResult = await handle.wait();
console.log(result.status, result.sessionId, result.logPath);
```

- `runTask(config, options?)` returns a `TaskHandle` with `wait()` and `stop()`.
- `stop()` is idempotent; `stop()` then `wait()` resolves `status: "stopped"`.
- Requires a configured provider/Key (same as the TUI).

Full contract (camelCase) and a self-contained runnable check: [docs/SDK.md](docs/SDK.md).

---

## 🔁 Resume a conversation

Sessions are saved automatically. Run the commands below from your shell; if the TUI is open, exit first with `/exit`. There is no `/resume` slash command inside the TUI.

List saved sessions:

```bash
fastcode sessions
```

Inspect one before resuming:

```bash
fastcode sessions show <id> --full
```

Open the session picker:

```bash
fastcode resume
```

In a terminal this shows your sessions. Use ↑/↓ to move, `1`–`9` to jump, Enter to resume, Esc to cancel. When stdout/stdin is piped it falls back to the newest session.

Resume a specific session directly:

```bash
fastcode resume <id>
```

`resume` restores the working directory, provider, model and conversation, including the compacted summary. If the original JSONL was pruned, FastCode prints a warning and resumes from the projection instead. `/compact` does not delete history; it writes a summary and keeps recent turns.

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
| Stdio CLI (opt-in) | `FASTCODE_STDIO_COMMAND` (+ optional `FASTCODE_STDIO_ARGS`, `FASTCODE_STDIO_MODEL`, `FASTCODE_STDIO_ENV_ALLOWLIST`) |

Optional hooks: set `FASTCODE_HOOKS=1` to load `~/.fastcode/hooks/*.mjs` in the TUI and `--ui` runners (off by default; see [docs/CONFIGURATION.md](docs/CONFIGURATION.md)).

**Persist it in `~/.bashrc`:**

```bash
echo 'export DEEPSEEK_API_KEY=sk-your-key' >> ~/.bashrc
```

**Or** configure a provider from the TUI. `/provider`, `/model`, and `/login` without arguments open the same keyboard-driven setup flow; arrow keys and Enter select, and `1`–`9` quick-select the numbered options. Escape cancels without changing settings. API key input is masked:

```text
/provider                                   # choose provider → model → key
/model                                      # current provider/model → key
/login                                      # choose provider → model → key
/login deepseek                             # continue at model selection
/login deepseek deepseek-flash               # continue at masked key entry
/login deepseek deepseek-flash sk-your-key   # or on one line
```

Offline model lists show built-in/cached choices with a notice; a model ID can also be entered manually. Providers that do not require a key skip key entry. Every save echoes **provider · scope (all its models) · key tail (`sk-****abcd`) · file**.

> 🔐 Keys live in `~/.fastcode/auth.json`, **one key per provider**, separate from `config.json`. Switching models inside a provider reuses the same key. v1/v2 files are migrated automatically on first read and backed up as `auth.json.v2.bak` — see [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Env vars (`DEEPSEEK_API_KEY`, …) are also provider-wide.

### Live provider check

After setting a real key, ask FastCode to list models for the current provider:

```bash
fastcode model
```

When a key is available, this calls the provider's `/models` endpoint. If the request fails or the provider has no endpoint, FastCode falls back to the built-in/cached list. In the TUI, `/model` opens the picker and uses the live list when possible.

Check whether the key is visible:

```bash
fastcode doctor
```

`doctor --net` only probes the npm registry, not provider authentication. A `401` from a model list usually means an invalid key; DNS/timeout means network trouble; a static list means no key, no supported endpoint, or offline fallback.

---

## 🧰 Commands

| Command | Purpose |
|---|---|
| `fastcode` / `fastcode "prompt"` | open the TUI / open it with an initial prompt |
| `fastcode --version` / `-v` / `--help` / `-h` / `help` | version / all commands |
| `fastcode provider [id] [model]` / `model [id]` | list or set the default provider / model (model is required when the provider has no verified default) |
| `fastcode config` / `config path` | show config + paths / print only config.json |
| `fastcode config export [--out <file>] [--with-keys]` / `config import <file>` | export/import config, auth, trust and model metadata; import writes `.import.bak.<ts>` backups |
| `fastcode sessions` / `sess` / `sessions show <id> [--full\|--max-chars N]` / `resume [id\|latest]` | list (`--all`, `--limit N`) / inspect facts, projection and provenance / resume (no id opens the picker) |
| `fastcode trust [dir]` / `untrust [dir]` / `trusted` / `trust --forget <key>` | trust management and remembered approvals |
| `fastcode skills list\|install <id> [--force]\|uninstall <id>\|search <q>` | skill management |
| `fastcode doctor` / `doctor --net` / `doctor --backup-check` | environment self-check; `--net` probes registry connectivity; `--backup-check` lists config/auth/trust/model-meta presence and modes |
| `fastcode update` | check for a newer release |
| `--ui tty\|native\|plain\|json` | approval/render backend (default `tty`; plain/json for no TTY) |
| `--long-run` / `--full-access` | long-run mode: turns=9999, anchor 30000 chars; does not disable egress/trust/sandbox/approval |
| `--cost-cap <USD>` | process-local cost cap (default unlimited) |

`fastcode "prompt"` and `resume` enter a conversation; the subcommands above do not send a model request.

**TUI slash commands (no model request):**
- Config/info: `/help` (`/h`, `/?`) `/about` (`/version`) `/config` `/theme` `/system` `/reset` `/whoami`
- Model/key: `/provider` `/model` `/effort` `/login` `/logout`
- Context/audit: `/context` `/compact [list|clean <seq|all>]` `/cost` `/facts show <seq>|provenance` `/expand [id]` `/clear` (`/cls`) `/revert <n>` (`/undo`) `/cancel` `/steer` `/exit` (`/quit`, `/q`)
- Planning/worktree: `/plan` (`/todo`/`/todos`) `/goal` `/worktree`
- Agent/background: `/agent` `/tools` `/cwd` `/jobs` `/attach` `/kill` `/bg` `/threads [1-128]` (`/pool`)
- Extensions/input: `/skills` `/plugin` `/edit`

Full command and settings reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

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
| One Ctrl+C exits | fixed: it only warns, press twice to quit (make sure you're on a build with this fix) |
| Command blocked | check for `[guardrails] HARD_BLOCK`; Hard Block cannot be overridden. Non-hard/Soft Gate paths may be temporarily allowed with `FASTCODE_ALLOW_DANGEROUS=1` |

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
fastcode-portable-<version>.tar.gz       self-contained single-file bundle
fastcode-portable-<version>.zip          same (needs the `zip` command)
datename-fastcode-termux-<version>.tgz   npm package (npm pack)
SHA256SUMS                               checksums

# <version> comes from package/package.json.
```

### Publish to npm

npm publish is **opt-in**: set repository variable `PUBLISH_NPM=true` to let
`.github/workflows/release.yml` publish on a `v*` tag (Trusted Publishing or
`NPM_TOKEN`). A tag alone only creates the GitHub Release. Manual fallback:

```bash
cd package
npm publish --access public --tag beta
```

### GitHub Releases

CI publishes automatically (`.github/workflows/release.yml`) — just push a tag:

```bash
git tag v<version>
git push origin v<version>        # Actions: build + package + upload Release
```

Or manually:

```bash
gh release create v<version> -t "FastCode <version>" \
  release/fastcode-portable-<version>.tar.gz \
  release/datename-fastcode-termux-<version>.tgz \
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
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | runtime/build dependencies, packaging, plugin boundaries |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | architecture, modules, data flow |
| [docs/MODULES.md](docs/MODULES.md) | what every source file does |
| [docs/AUDIT.md](docs/AUDIT.md) | security and robustness audit |
| [docs/SECURITY_MATRIX.md](docs/SECURITY_MATRIX.md) | attack regression matrix and known security gaps |
| [docs/DEVLOG.md](docs/DEVLOG.md) | change log: migrations, risks, rollback |
| [LOCALIZATION_REPORT.md](LOCALIZATION_REPORT.md) | 0.1.6-beta handover report (historical) |
| [CHANGELOG.md](CHANGELOG.md) | release notes (historical versions included) |
| [PATCHES.md](PATCHES.md) | earlier fixes + harness changes |

---

## ℹ️ About this build

- FastCode-Termux is maintained independently as the Termux/Android build.
  `package/src` is the source of truth and `npm run build` rebuilds `dist`.

---

## 🙏 Credits

Thanks to the FastCode-Termux contributors and the open-source dependency authors
(Ink, React, meow, cfonts, marked, chalk, ...).

## 📜 License

MIT. Copyright notices retained in [LICENSE](LICENSE).

<sub>Made for Termux 🐧📱 · FastCode</sub>
