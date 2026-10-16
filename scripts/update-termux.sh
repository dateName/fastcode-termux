#!/data/data/com.termux/files/usr/bin/bash
# FastCode 手机版更新脚本（Termux / Android）
# 用法：
#   bash update-termux.sh /path/to/package    # 从本地目录强制重装
#   bash update-termux.sh --git /path/to/repo # 先 git pull，再装 repo/package
#   bash update-termux.sh --npm               # 从 npm 安装官方最新版
set -e

MODE="$1"
TARGET="$2"

echo "==> 更新前版本"
fastcode --version || true

case "$MODE" in
  --git)
    if [ -z "$TARGET" ]; then echo "缺少仓库路径"; exit 1; fi
    echo "==> 拉取最新代码：$TARGET"
    git -C "$TARGET" pull --ff-only
    echo "==> 重新安装"
    npm install -g "$TARGET/package"
    ;;
  --npm)
    echo "==> 从 npm 安装最新版"
    npm install -g @datename/fastcode-termux@latest
    ;;
  *)
    DIR="$MODE"
    if [ -z "$DIR" ]; then DIR="$HOME/fastcode/package"; fi
    echo "==> 从目录强制重装：$DIR"
    npm install -g "$DIR" --force
    ;;
esac

echo "==> 更新后版本"
fastcode --version || true
fastcode update || true
fastcode doctor || true
