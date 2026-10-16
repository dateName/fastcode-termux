#!/usr/bin/env bash
# FastCode 一键安装（Termux / Linux / macOS）
#
# 用法：在克隆下来的仓库根目录执行
#     bash scripts/install.sh
#
# 原理：package/dist/cli.js 是 esbuild 打包出的自包含单文件（已随仓库提交），
#       里面已经内联了 Ink/React/meow 等全部依赖。所以只要它存在，就把它
#       软链到 PATH，完全跳过 npm install；只有产物缺失时才回退到本地构建。
set -e

if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; NC=''
fi
info() { printf "${GREEN}%s${NC}\n" "$*"; }
warn() { printf "${YELLOW}%s${NC}\n" "$*"; }
fail() { printf "${RED}%s${NC}\n" "$*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PKG_DIR="$PROJECT_DIR/package"
DIST_CLI="$PKG_DIR/dist/cli.js"

# 目标 bin 目录：Termux 优先用 $PREFIX/bin
if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
  BIN_DIR="$PREFIX/bin"
elif [ -d "/data/data/com.termux/files/usr/bin" ]; then
  BIN_DIR="/data/data/com.termux/files/usr/bin"
else
  BIN_DIR="${HOME}/.local/bin"
fi

printf "🚀 FastCode 安装程序\n"
printf "   项目目录：%s\n" "$PROJECT_DIR"
printf "   安装到：  %s\n" "$BIN_DIR"

# 1) Node.js 检查
command -v node >/dev/null 2>&1 || fail "❌ 未检测到 Node.js，请先运行：pkg install nodejs"
MAJOR=$(node -p 'process.versions.node.split(".")[0]')
MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$MAJOR" -lt 18 ] || { [ "$MAJOR" -eq 18 ] && [ "$MINOR" -lt 17 ]; }; then
  fail "❌ 需要 Node.js ≥ 18.17，当前版本：$(node -v)（可运行 pkg upgrade nodejs）"
fi
info "✔ Node.js $(node -v)"

# 2) 定位可执行产物（缺失才回退构建）
if [ ! -f "$DIST_CLI" ]; then
  warn "⚠️  未找到 $DIST_CLI，尝试本地构建（需要 npm 与网络）..."
  command -v npm >/dev/null 2>&1 || fail "❌ 缺少打包产物且未找到 npm。请重新 clone（仓库内已含 package/dist/cli.js）。"
  if [ "${FASTCODE_NPM_MIRROR:-}" != "0" ]; then
    warn "💡 如安装缓慢，可先执行：npm config set registry https://registry.npmmirror.com"
  fi
  ( cd "$PKG_DIR" && npm install --no-audit --no-fund && npm run build )
fi
[ -f "$DIST_CLI" ] || fail "❌ 构建失败：仍找不到 $DIST_CLI"

chmod +x "$DIST_CLI" 2>/dev/null || true

# 3) 建立全局命令（软链到自包含产物）
mkdir -p "$BIN_DIR"
ln -sf "$DIST_CLI" "$BIN_DIR/fastcode"
ln -sf "$DIST_CLI" "$BIN_DIR/fc" 2>/dev/null || true

# 4) PATH 提示
case ":${PATH}:" in
  *":$BIN_DIR:"*) ;;
  *) warn "⚠️  $BIN_DIR 不在 PATH 中，请加入 ~/.bashrc："; warn "    export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac

info "✅ 安装成功！运行 fastcode 或 fc 开始使用"
node "$DIST_CLI" --version 2>/dev/null || true
