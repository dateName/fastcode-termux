#!/data/data/com.termux/files/usr/bin/bash
# 兼容旧文件名的薄封装：安装逻辑已统一到 scripts/install.sh
# （Termux / Linux / macOS 通用，支持 --dir / --repo / --branch / --no-global）
# 用法：bash scripts/install-termux.sh [install.sh 的参数...]
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bash "$DIR/install.sh" "$@"
