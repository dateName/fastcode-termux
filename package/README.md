# ⚡ FastCode

<p align="center">
  <strong>A colorful, fast, terminal-first AI coding assistant.</strong>
</p>

<p align="center">
  Multi-LLM chat • Agent Skills • Slash commands • Themes • Termux-ready
</p>

<p align="center">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18.17-3c873a?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="npm" src="https://img.shields.io/badge/npm-@simplelittledev%2Ffastcode-cb3837?style=for-the-badge&logo=npm&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge">
  <img alt="Termux" src="https://img.shields.io/badge/Termux-ready-7c3aed?style=for-the-badge&logo=android&logoColor=white">
</p>

```bash
npm install -g @simplelittledev/fastcode
fastcode
```

Short alias included:

```bash
fc
```

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

### Global install

```bash
npm install -g @simplelittledev/fastcode
fastcode
```

### Run without installing globally

```bash
npx @simplelittledev/fastcode
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

Or save a key from inside FastCode:

```text
/login openai sk-...
/login anthropic sk-ant-...
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
| `/provider [id]` | List or switch provider |
| `/model [id]` | List or switch model |
| `/login <provider> <key>` | Save API key |
| `/logout <provider>` | Remove API key |
| `/skills ...` | Search, install, enable, disable, list skills |
| `/theme [id]` | Switch theme |
| `/cost` | Show token and cost usage |
| `/system [text]` | Show or update system prompt |
| `/whoami` | Show configured provider keys |
| `/config` | Print config and paths |
| `/clear` | Clear conversation |
| `/reset` | Reset config |
| `/about` | Show version and platform |
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
npm install -g @simplelittledev/fastcode
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
git clone https://github.com/SimpleLittleDev/FastCode
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

## Safety, sessions and limits (0.1.6)

| Feature | Behaviour | Override |
| --- | --- | --- |
| Project trust | First run in a folder asks before agent tools load; the list lives in ~/.fastcode/trusted.json | fastcode trust / untrust / trusted, FASTCODE_TRUST_ALL=1 |
| Dangerous-command guard | rm -rf, del /f, rmdir /s, format / mkfs / diskpart, dd if=, writes to /dev/sd, shutdown / reboot / poweroff and fork bombs are refused before execution | FASTCODE_ALLOW_DANGEROUS=1, FASTCODE_SHELL_ALLOWLIST, FASTCODE_SHELL_DENY_EXTRA |
| Unified tool-output cap | Output is truncated while it is produced, not sliced afterwards (default 30000 characters) | FASTCODE_TOOL_OUTPUT_LIMIT |
| Session log | Append-only JSONL in ~/.fastcode/sessions, resumable after a crash | fastcode sessions, fastcode resume, FASTCODE_SESSION_LOG=0, FASTCODE_SESSION_CACHE_MB |

The dangerous-command deny list is ported from HKUDS/FastCode nanobot
(nanobot/agent/tools/shell.py).

## 📜 License

MIT © SimpleLittleDev
