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

```bash
npm install -g @datename/fastcode-termux
fastcode
```

Short alias included:

```bash
fc
```

This tree is **0.1.6-beta**. When the beta is published to npm, install it with
`npm install -g @datename/fastcode-termux@0.1.6-beta`; until then use the repo/portable build.

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
| ⚡ Slash commands | Switch models, manage keys, enable skills, inspect config |
| 📱 Termux-ready | Stable UI mode helps avoid flicker on Android terminals |
| 🔐 Local config | Keys and preferences stay under `~/.fastcode` |

---

## 🚀 Install

### Install from the source repo (recommended)

The repo ships a self-contained bundle at `package/dist/cli.js`, so a plain
`git clone` runs without `npm install`:

```bash
git clone https://github.com/dateName/fastcode-termux.git
cd fastcode-termux
bash scripts/install.sh
fastcode
```

Manual equivalent:

```bash
git clone https://github.com/dateName/fastcode-termux.git
cd fastcode-termux/package
npm install          # ⚠️ do not skip
npm link
```

### Global install

```bash
npm install -g @datename/fastcode-termux
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
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| `mistral` | `mistral-small-latest` | `MISTRAL_API_KEY` |
| `ollama` | `llama3.2` | Local, no API key required |

Switch anytime:

```text
/provider openai
/model gpt-4o-mini
```

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

## 🧩 Plugins

Plugins are always-active behavior packs. A plugin folder can contain:

```text
my-plugin/
├── PLUGIN.md
└── skills/
    └── reviewer/
        └── SKILL.md
```

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

## 🎮 Slash Commands

| Command | Action |
| --- | --- |
| `/help` | Show command list |
| `/agent [on/off/status]` | Toggle local coding-agent tools |
| `/tools` | Show available coding tools |
| `/cwd` | Show agent sandbox root |
| `/plugin ...` | Import and manage always-active plugin packs |
| `/provider [id]` | Pick or switch provider (interactive when omitted) |
| `/model [id]` | Pick or switch model (interactive when omitted) |
| `/effort [level]` | Thinking effort: auto / low / medium / high / max |
| `/login [provider] [model] [key]` | Bind a provider-wide API key (guided when omitted) |
| `/logout <provider>` | Remove the provider's key (`--all` accepted for compatibility) |
| `/skills ...` | Search, install, enable, disable, list skills |
| `/theme [id]` | Switch theme |
| `/cost` | Show token and cost usage |
| `/system [text]` | Show or update system prompt |
| `/whoami` | Show configured provider keys |
| `/config` | Print config and paths |
| `/clear` | Clear conversation |
| `/reset` | Reset config |
| `/about` | Show version and platform |
| `/context` | Token estimate, compaction threshold, heap |
| `/compact` | Force local context compaction |
| `/cancel` | Abort the active run (mobile alternative to Esc) |
| `/steer <text>` | Guide the next request of an active run |
| `/jobs` / `/attach <id>` / `/kill <id>` | Background shell sessions |
| `/expand` | Toggle full/collapsed tool output |
| `/edit` | Edit the prompt in `$EDITOR` (works around Ink IME bugs) |
| `/bg` | Explain background shell behaviour |
| `/exit` | Quit |

Keyboard controls:

```text
Esc       cancel streaming
Ctrl+C    press twice to quit
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
npm install -g @datename/fastcode-termux
fastcode
```

If the command is not found, check your npm global binary path:

```bash
npm bin -g
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

## Safety, sessions and limits (0.1.6-beta)

| Feature | Behaviour | Override |
| --- | --- | --- |
| Project trust | First run in a folder asks before agent tools load; the list lives in ~/.fastcode/trusted.json | fastcode trust / untrust / trusted, FASTCODE_TRUST_ALL=1 |
| Dangerous-command guard | rm -rf, del /f, rmdir /s, format / mkfs / diskpart, dd if=, writes to /dev/sd, shutdown / reboot / poweroff and fork bombs are refused before execution | FASTCODE_ALLOW_DANGEROUS=1, FASTCODE_SHELL_ALLOWLIST, FASTCODE_SHELL_DENY_EXTRA |
| Unified tool-output cap | Output is truncated while it is produced, not sliced afterwards (default 30000 characters) | FASTCODE_TOOL_OUTPUT_LIMIT |
| Session log | Append-only JSONL in ~/.fastcode/sessions, resumable after a crash (cache cap 256MB by default) | fastcode sessions, fastcode resume, FASTCODE_SESSION_LOG=0, FASTCODE_SESSION_CACHE_MB |
| Checkpoints/projection | `*.projection.json` (<20KB) with tool/model/cwd fingerprint; unpaired tool calls are completed on resume | FASTCODE_FSYNC, FASTCODE_SESSION_LOG |
| Patch transaction | parse → plan → apply; CRLF/mode kept; symlinks refused; move never overwrites | `/expand` for the full diff |
| Process tree | abort or `/kill` kills children/grandchildren | POSIX process group, Windows `taskkill /T` |
| Compaction | token threshold or heap pressure; summary written to `summary-*.md` | FASTCODE_COMPACTION=0, FASTCODE_HEAP_LIMIT_MB |
| Background shell | Commands over ~2s return a session id; poll incrementally | `/jobs`, `/attach`, `/kill`, FASTCODE_MAX_SPAWN_PER_TURN |
| Approval hook | Sensitive/large patches need approval; without a resolver they are denied (fail closed) | pending UI not implemented yet |

## 🙏 Credits

- **SimpleLittleDev** — author of the original FastCode TUI; the npm package
  `@simplelittledev/fastcode` and its credit belong to them.
- All upstream dependency authors (Ink, React, meow, cfonts, marked, chalk, ...).

## 📜 License

MIT © SimpleLittleDev
