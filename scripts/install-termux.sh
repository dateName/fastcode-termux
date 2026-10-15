#!/data/data/com.termux/files/usr/bin/bash
# FastCode 手机版一键安装脚本（Termux / Android）
# 用法：
#   bash install-termux.sh                    # 安装默认路径 ~/fastcode/package
#   bash install-termux.sh /path/to/package   # 安装指定包目录
#   bash install-termux.sh "" https://github.com/you/FastCode.git
set -e

PKG_DIR="$1"
REPO_URL="$2"

echo "==> 更新 Termux 软件源"
pkg update -y && pkg upgrade -y

echo "==> 安装运行依赖"
pkg install -y nodejs git ca-certificates

echo "==> 当前 Node / npm"
node -v
npm -v

if [ -n "$REPO_URL" ]; then
  echo "==> 从 Git 仓库安装：$REPO_URL"
  rm -rf "$HOME/.fastcode-src"
  git clone --depth 1 "$REPO_URL" "$HOME/.fastcode-src"
  npm install -g "$HOME/.fastcode-src/package"
elif [ -n "$PKG_DIR" ]; then
  echo "==> 从本地目录安装：$PKG_DIR"
  npm install -g "$PKG_DIR"
else
  echo "==> 从默认路径安装：$HOME/fastcode/package"
  npm install -g "$HOME/fastcode/package"
fi

echo "==> 校验"
fastcode --version || true
fastcode doctor || true

cat <<'EOT'

安装完成。后续步骤：
  1) 配置 API Key（任选其一，建议写入 ~/.bashrc）：
       export DEEPSEEK_API_KEY=sk-...
       export ANTHROPIC_API_KEY=sk-ant-...
  2) 启动：fastcode
  3) 保持会话：termux-wake-lock
  4) 详细说明见 README.zh.md
EOT
