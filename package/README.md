# ⚡ FastCode

<p align="center">
  <strong>A colorful, fast, terminal-first AI coding assistant.</strong>
</p>

<p align="center">
  Multi-LLM chat • Agent Skills • Slash commands • Themes • Termux-ready
</p>

<p align="center">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18.17-3c873a?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="npm" src="https://img.shields.io/badge/npm-@datename%2Ffastcode--termux-cb3837?style=for-the-badge&logo=npm&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge">
  <img alt="Termux" src="https://img.shields.io/badge/Termux-ready-7c3aed?style=for-the-badge&logo=android&logoColor=white">
</p>

Install from npm:

```bash
npm install -g @datename/fastcode-termux@latest
```

Start FastCode:

```bash
fastcode
```

`latest` is the stable channel. The short alias is `fc`.

---

## 🌈 What Is FastCode?

FastCode is a beautiful TUI coding assistant that runs inside your terminal.
It connects to your favorite AI provider, keeps the workflow command-driven,
and supports Anthropic-style **Agent Skills** for specialized abilities.

It is built for developers who want an AI assistant that feels quick, direct,
and usable from anywhere: Linux, macOS, Windows, and Android through Termux.

---

## ✨ Highlights

| Feature | What You Get |
| --- | --- |
| 🎨 Colorful TUI | Big FastCode banner, themes, transcript bubbles, status bar |
| 🤖 Multi-provider | Anthropic, OpenAI, Gemini, OpenRouter, Groq, DeepSeek, Mistral, Ollama |
| 🧠 Agent Skills | Install and enable `SKILL.md` powered workflows |
| 🧩 Plugins | Import always-active plugin packs with bundled skills |
| 🛠️ Coding Agent | Shell, file editing, grep, patching, and sandboxed local tools |
| 💾 Session recovery | Append-only facts + projections; `resume` restores cwd/provider/model, marks interrupted calls `INTERRUPTED`, and can recover projection-only sessions |
| 🗜️ Safe compaction | `/context`/`/compact`/`/clear`; token/heap compaction keeps decisions, files and recent turns while full history stays append-only |
| 🔍 Auditable diffs | Full-file before, separate hunks for distant edits, hunk-boundary truncation, and `/expand <id>` for the complete stored output/diff |
| 🛡️ Risk-based approval | Sensitive paths, dangerous commands and large edits require approval; once/session/always, fail-closed without a resolver, Hard Block preserved |
| ⚡ Slash commands | Switch models, manage keys, enable skills, inspect config |
| 📱 Termux-ready | Stable UI mode helps avoid flicker on Android terminals |
| 🔐 Local config | Keys and preferences stay under `~/.fastcode` |

---

## 🚀 Install

### Install from the source repo (recommended)

The repo ships a self-contained bundle at `package/dist/cli.js`, so a plain
`git clone` runs without `npm install`.

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

Manual equivalent — clone:

```bash
git clone https://github.com/dateName/fastcode-termux.git
```

Enter the package directory:

```bash
cd fastcode-termux/package
```

Install dependencies:

```bash
npm install
```

Link the build:

```bash
npm link
```

### Global install

Install from npm:

```bash
npm install -g @datename/fastcode-termux@latest
```

Start FastCode:

```bash
fastcode
```

### Run without installing globally

```bash
npx @datename/fastcode-termux
```

### Start with a prompt

```bash
fastcode "explain this repository"
```

### Resume a conversation

Sessions are saved automatically. Run these from your shell; inside the TUI, exit with `/exit` first.

List sessions:

```bash
fastcode sessions
```

Inspect a session:

```bash
fastcode sessions show <id> --full
```

Open the session picker:

```bash
fastcode resume
```

In a terminal: ↑/↓ move, `1`–`9` jump, Enter resume, Esc cancel. Piped stdin falls back to the newest session.

Resume a specific session directly:

```bash
fastcode resume <id>
```

`resume` restores cwd, provider, model and conversation, including the compacted summary. A pruned JSONL falls back to its projection with a warning.

---

## 🔑 Add Your API Key

Use environment variables:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."
```

Or bind a key from inside FastCode — one key per provider, reused by all its models (input is masked):

```text
/login                                        # guided: provider → model → key
/login openai gpt-4o-mini sk-...
/login anthropic claude-3-5-sonnet-latest sk-ant-...
```

Then start chatting:

```bash
fastcode
```

---

## 🧩 Providers

| Provider | Default Model | Auth |
| --- | --- | --- |
| `anthropic` | `claude-3-5-sonnet-latest` | `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` |
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| `google` | `gemini-1.5-flash` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `openrouter` | `anthropic/claude-3.5-sonnet` | `OPENROUTER_API_KEY` |
| `groq` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| `deepseek` | `deepseek-flash` | `DEEPSEEK_API_KEY` |
| `mistral` | `mistral-small-latest` | `MISTRAL_API_KEY` |
| `ollama` | `llama3.2` | Local, no API key required |

Switch anytime:

```text
/provider openai
/model gpt-4o-mini
```

Check whether FastCode can see a key:

```bash
fastcode doctor
```

List models for the current provider (live `/models` when a key is available, static fallback otherwise):

```bash
fastcode model
```

`doctor --net` only probes the npm registry; it does not verify provider authentication.

---

## 🪄 Agent Skills

FastCode can install and inject Anthropic-style skills into the system prompt.

```text
/skills search pdf
/skills install pdf
/skills install anthropics/skills/pdf
/skills install https://example.com/my-skill/SKILL.md
/skills enable pdf
/skills list
/skills info pdf
```

Installed skills live here:

```text
~/.fastcode/skills/<name>/SKILL.md
```

---

## 🛠️ Coding Agent

FastCode can act as a local coding agent. Agent mode is enabled by default and
works with any provider, including local Ollama models.

```text
/agent status
/agent on
/agent off
/tools
/cwd
```

Available tools include:

```text
shell, pwd, read_file, read_many, write_file, append_file, apply_patch,
replace_in_file, list_files, grep, stat_path, make_dir, copy_file,
move_path, delete_file
```

Tools run inside a sandbox rooted at the directory where you start FastCode.
File tools cannot access paths outside that root. Shell commands run with:

```text
FASTCODE_SANDBOX=1
FASTCODE_SANDBOX_ROOT=<current-working-directory>
```

Example:

```bash
cd ~/my-project
fastcode "run the tests, find the failing file, patch it, and verify the fix"
```

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

`runTask(config, options?)` returns a `TaskHandle` with `wait()` and `stop()`. Requires a configured provider/key (same as the CLI).

Full contract (camelCase) and a self-contained runnable check: https://github.com/dateName/fastcode-termux/blob/main/docs/SDK.md

---

## 🧩 Plugins

Plugins are always-active behavior packs. They are not npm dependencies and do not execute code. A plugin folder can contain:

```text
my-plugin/
├── plugin.json          # optional manifest: name/version/description/scope/capabilities
├── PLUGIN.md            # prompt body; README.md is the fallback
├── SKILL.md             # optional root skill
└── skills/
    └── reviewer/
        └── SKILL.md
```

`capabilities` supports only `prompt` and `skills`; other capabilities are rejected at import. With no manifest, capabilities are inferred from the files. `scope:"project"` installs under `<cwd>/.fastcode/plugins/` and loads only when the project is trusted.

Import and enable a plugin:

```text
/plugin import ./my-plugin reviewer
/plugin list
/plugin info reviewer
/plugin disable reviewer
/plugin enable reviewer
/plugin remove reviewer
```

Installed plugins live under:

```text
~/.fastcode/plugins/
```

---

## ⌨️ CLI Commands

These subcommands do not start a conversation:

| Command | Action |
| --- | --- |
| `fastcode` / `fastcode "prompt"` | open TUI / open with an initial prompt |
| `fastcode --version` / `-v` / `--help` / `-h` | version / all commands |
| `fastcode provider [id]` / `model [id]` | list or set default provider / model |
| `fastcode config` / `config path` | config + paths / config.json path only |
| `fastcode config export [--out <file>] [--with-keys]` / `config import <file>` | export/import config, auth, trust and model metadata (import creates `.import.bak.<ts>`) |
| `fastcode sessions` / `sess` / `sessions show <id> [--full\|--max-chars N]` / `resume [id\|latest]` | list (`--all`, `--limit N`) / inspect / resume (no id opens the picker) |
| `fastcode trust [dir]` / `untrust [dir]` / `trusted` / `trust --forget <key>` | trust management |
| `fastcode skills list\|install <id> [--force]\|uninstall <id>\|search <q>` | skill management |
| `fastcode doctor` / `doctor --net` / `doctor --backup-check` | diagnostics / probe registry / check config-auth-trust-model-meta presence and modes |
| `fastcode update` | check for updates |
| `--ui tty\|native\|plain\|json` | approval/render backend |
| `--long-run` / `--full-access` | turns=9999, anchor 30000 chars; does not disable egress/trust/sandbox/approval |
| `--cost-cap <USD>` | process-local cost cap |

---

## 🎮 Slash Commands

These run in the TUI without sending a model request:

| Command | Action |
| --- | --- |
| `/help` (`/h`, `/?`) | Show command list |
| `/agent [on/off/status]` | Toggle local coding-agent tools |
| `/tools` | Show available coding tools |
| `/cwd` | Show agent sandbox root |
| `/plugin [list\|import\|enable\|disable\|remove\|info]` | Import and manage always-active plugin packs |
| `/provider [id]` | Pick or switch provider (interactive when omitted) |
| `/model [id]` | Pick or switch model (interactive when omitted) |
| `/effort [level]` | Thinking effort: auto / low / medium / high / max |
| `/login [provider] [model] [key]` | Bind a provider-wide API key (guided when omitted) |
| `/logout <provider> [model\|--all]` | Remove the provider's key (`--all` for provider-wide) |
| `/skills [list\|search\|install\|uninstall\|enable\|disable\|info\|verify\|registry]` | Search, install, enable, disable, verify and list skills |
| `/theme [id]` | Switch theme |
| `/cost` | Show token and cost usage |
| `/system [text]` | Show or update system prompt |
| `/whoami` | Show configured provider keys |
| `/config` | Print config and paths |
| `/clear` (`/cls`) | Clear conversation and write a `cleared` fact |
| `/reset` | Reset config |
| `/about` (`/version`) | Show version and platform |
| `/context` | Token estimate, compaction threshold, heap |
| `/compact [list\|clean <seq\|all>]` | Force compaction, list compacted facts, or clean summary files |
| `/facts show <seq> \| provenance` | Print a full fact/raw output or the latest provenance report |
| `/revert <n>` (`/undo`) | Remove user message n and later; message-only |
| `/cancel` | Abort the active run (mobile alternative to Esc) |
| `/steer <text>` | Guide the next request of an active run |
| `/plan` (`/todo`, `/todos`) | show / set a; b / add / start / done / remove / clear |
| `/goal [text\|off]` | Show, set or clear the session goal |
| `/worktree` | list / create / diff / apply / remove git worktrees |
| `/jobs` / `/attach [id]` / `/kill [id]` | Background shell sessions; omit id to pick |
| `/threads [1-128]` (`/pool`) | Show current value and prefill `/threads `; set resident shell concurrency (default 2, max 128) |
| `/expand [id]` | Toggle full/collapsed future tool output; with `<id>`, reprint that stored tool result and diff |
| `/edit` | Edit the prompt in `$EDITOR` (works around Ink IME bugs) |
| `/bg` | Explain background shell behaviour |
| `/exit` (`/quit`, `/q`) | Exit; during a run requires a second confirmation |

Keyboard controls:

```text
Esc       cancel streaming; partial output is kept
Ctrl+C    during a run: first cancels, second quits; idle: press twice to quit
```

---

## 🎨 Themes

```text
/theme fastcode
/theme neon
/theme sunset
/theme matrix
/theme mono
```

Want the calmest terminal experience?

```bash
FASTCODE_STABLE_UI=1 fastcode
```

Termux enables stable UI automatically.

---

## 📱 Termux

Install Node.js first:

```bash
pkg install nodejs
```

HTTPS to npm, GitHub and model APIs needs a CA root bundle. If Node/npm reports `certificate verify failed` or `unable to get local issuer certificate`, install the bundle:

```bash
pkg install ca-certificates
```

If your Termux already has a working bundle and you do not want to install it explicitly, the command above without `ca-certificates` is enough:

```bash
pkg install nodejs
```

Verify HTTPS:

```bash
node -e "fetch('https://registry.npmjs.org/').then((r) => console.log(r.status)).catch((e) => { console.error(e.message); process.exit(1); })"
```

Do not disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED=0` / `strict-ssl=false`) as a workaround.

Install the stable package:

```bash
npm install -g @datename/fastcode-termux@latest
```

Start FastCode:

```bash
fastcode
```

> `latest` is the stable line; `beta` is the pre-release channel.

If the command is not found, print the global binary directory:

```bash
npm bin -g
```

Then check your `PATH`:

```bash
echo "$PATH"
```

FastCode stores config inside your home directory:

```text
~/.fastcode/
├── config.json
├── auth.json
├── skills/
├── plugins/
├── cache/
├── sessions/
└── logs/
```

You can move that root with:

```bash
FASTCODE_HOME=/path/to/fastcode fastcode
```

---

## 🛠️ Development

```bash
git clone https://github.com/dateName/fastcode-termux
cd FastCode
npm install
npm run dev
```

Quality checks:

```bash
npm run check
```

Or run each step:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Run the built CLI:

```bash
node ./bin/fastcode.mjs
```

---

## 📦 Publish Notes

The package exposes two global commands:

```json
{
  "bin": {
    "fastcode": "./bin/fastcode.mjs",
    "fc": "./bin/fastcode.mjs"
  }
}
```

Publish public scoped releases with:

```bash
npm publish --access public
```

---

## Safety and limits

FastCode can edit files and run commands, so these boundaries stay on by default:

- **Folder trust** — first run in a new folder asks for confirmation.
- **File sandbox** — file tools stay inside the project; `../` and symlink escapes are rejected.
- **Dangerous commands** — destructive commands, credential access and sensitive-data egress are blocked or sent for approval.
- **Approval** — sensitive or large edits require approval; without a resolver they fail closed.
- **Output limits** — console and model output are capped to keep a runaway command from flooding the session.
- **Session recovery** — sessions are append-only JSONL and can be resumed after a crash.

Provider keys, custom paths and finer policy controls are documented in
[`docs/CONFIGURATION.md`](docs/CONFIGURATION.md); implementation details are in
[`docs/AUDIT.md`](docs/AUDIT.md) and [`docs/ERROR_SEMANTICS.md`](docs/ERROR_SEMANTICS.md).

## 🙏 Credits

Thanks to the FastCode-Termux contributors and the open-source dependency authors
(Ink, React, meow, cfonts, marked, chalk, ...).

## 📜 License

MIT. Copyright notices retained in `LICENSE`.
