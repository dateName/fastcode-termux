#!/usr/bin/env bash
# FastCode 一键安装（直接从 Git 仓库安装，Termux / Linux / macOS 通用）
#
# 默认行为：安装 Node/git（如缺）-> 浅克隆仓库 -> 全局安装 package/ -> 自检
#
# 用法：
#   bash scripts/install.sh                     # 默认克隆到 ~/fastcode
#   bash scripts/install.sh --dir ~/src/fastcode
#   bash scripts/install.sh --repo https://github.com/you/fork.git
#   bash scripts/install.sh --branch dev
#   bash scripts/install.sh --no-global         # 不全局安装，只在本地 npm install
#   FASTCODE_REPO=... FASTCODE_BRANCH=... bash scripts/install.sh
#
# 一行命令（Termux / Linux / macOS，需 curl 或 wget）：
#   curl -fsSL https://raw.githubusercontent.com/dateName/fastcode-termux/main/scripts/install.sh | bash
set -euo pipefail

REPO_URL="${FASTCODE_REPO:-https://github.com/dateName/fastcode-termux.git}"
BRANCH="${FASTCODE_BRANCH:-main}"
CLONE_DIR="${FASTCODE_DIR:-$HOME/fastcode}"
GLOBAL=1

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m!!\033[0m %s\n' "$*" >&2; }
info() { printf '    %s\n' "$*"; }

usage() {
  cat <<'EOF'
FastCode installer

  --dir <path>     克隆目录（默认 ~/fastcode）
  --repo <url>     仓库地址（默认官方仓库）
  --branch <name>  分支（默认 main）
  --no-global      不全局安装，只在本地 npm install
  -h, --help       显示本帮助
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) CLONE_DIR="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --no-global) GLOBAL=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "未知参数：$1"; usage; exit 1 ;;
  esac
done

is_termux() {
  [ -n "${TERMUX_VERSION:-}" ] || [ "${PREFIX:-}" = "/data/data/com.termux/files/usr" ]
}

install_deps() {
  if command -v node >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
    return 0
  fi
  if is_termux; then
    say "安装 Node.js 与 git（pkg）"
    pkg update -y && pkg install -y nodejs git ca-certificates
  elif command -v apt-get >/dev/null 2>&1; then
    say "安装 Node.js 与 git（apt，可能需要 sudo 密码）"
    sudo apt-get update -y && sudo apt-get install -y nodejs npm git ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    say "安装 Node.js 与 git（dnf）"
    sudo dnf install -y nodejs git
  elif command -v pacman >/dev/null 2>&1; then
    say "安装 Node.js 与 git（pacman）"
    sudo pacman -Sy --noconfirm nodejs npm git
  elif command -v brew >/dev/null 2>&1; then
    say "安装 Node.js 与 git（brew）"
    brew install node git
  else
    err "未找到包管理器，请先手动安装 Node.js >= 18.17 与 git 后重试"
    exit 1
  fi
}

check_node() {
  command -v node >/dev/null 2>&1 || { err "未找到 Node.js"; exit 1; }
  local major minor
  major=$(node -p 'process.versions.node.split(".")[0]')
  minor=$(node -p 'process.versions.node.split(".")[1]')
  if [ "$major" -lt 18 ] || { [ "$major" -eq 18 ] && [ "$minor" -lt 17 ]; }; then
    err "Node.js 需要 >= 18.17，当前为 $(node -v)"
    exit 1
  fi
  say "Node.js $(node -v)"
}

install_deps
check_node

say "拉取仓库：$REPO_URL（分支 $BRANCH）"
if [ -d "$CLONE_DIR/.git" ]; then
  info "已存在，尝试 git pull：$CLONE_DIR"
  git -C "$CLONE_DIR" pull --ff-only
else
  rm -rf "$CLONE_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$CLONE_DIR"
fi

PKG_DIR="$CLONE_DIR/package"
[ -f "$PKG_DIR/package.json" ] || { err "仓库中找不到 package/package.json"; exit 1; }

ADDED_PATH=""
if [ "$GLOBAL" -eq 1 ]; then
  say "全局安装 fastcode"
  if ! npm install -g "$PKG_DIR"; then
    err "全局安装失败（多为权限问题），改用用户前缀 ~/.local 重试"
    npm install -g --prefix "$HOME/.local" "$PKG_DIR"
    ADDED_PATH="$HOME/.local/bin"
    export PATH="$ADDED_PATH:$PATH"
  fi
else
  say "本地安装（--no-global）"
  ( cd "$PKG_DIR" && npm install )
fi

if command -v fastcode >/dev/null 2>&1; then
  say "校验"
  fastcode --version || true
  fastcode doctor || true
else
  err "fastcode 未进入 PATH，请检查 npm 全局 bin 目录是否在 PATH 中"
  info '试试：npm bin -g   或   echo "$PATH"'
fi

cat <<EOF

安装完成 🎉

  fastcode            # 启动
  fc                  # 短别名
  fastcode doctor     # 环境自检

先配一把 Key（任选其一），建议写入 ~/.bashrc 以持久化：

  export DEEPSEEK_API_KEY=sk-...
  export ANTHROPIC_API_KEY=sk-ant-...

Termux 附加提示：

  termux-setup-storage     # 让 ~/storage/shared 可用（访问手机上的项目/下载）
  termux-wake-lock         # 避免锁屏杀掉会话

代码目录：$CLONE_DIR
EOF

if [ -n "$ADDED_PATH" ]; then
  cat <<EOF

把下面这行加进 ~/.bashrc，让命令永久可用：

  export PATH="$ADDED_PATH:\$PATH"
EOF
fi
