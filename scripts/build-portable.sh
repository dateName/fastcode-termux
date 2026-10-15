#!/bin/sh
# 构建免安装便携包：release/fastcode-portable-<version>.tar.gz
# 用法：在项目根目录执行   sh scripts/build-portable.sh
set -e
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -z "$ROOT" ] || [ ! -d "$ROOT/package" ]; then
  echo "找不到 package 目录，请在项目根目录运行" >&2
  exit 1
fi
command -v node >/dev/null 2>&1 || { echo "需要 Node.js" >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "需要 npm" >&2; exit 1; }
PKG="$ROOT/package"
VER=$(cd "$PKG" && node -p "require('./package.json').version")
BUNDLE="$ROOT/release/fastcode-portable-$VER"
rm -rf "$ROOT/release"
mkdir -p "$BUNDLE/package"
cp -R "$PKG/bin" "$PKG/dist" "$PKG/src" "$BUNDLE/package/"
cp "$PKG/package.json" "$PKG/tsconfig.json" "$PKG/LICENSE" "$PKG/README.md" "$BUNDLE/package/"
echo "==> 安装生产依赖"
( cd "$BUNDLE/package" && npm install --omit=dev --no-audit --no-fund )
echo "==> 写入启动脚本"
cat > "$BUNDLE/fastcode" <<'EOF'
#!/bin/sh
# FastCode portable launcher (Termux / Linux / macOS)
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/package/bin/fastcode.mjs" "$@"
EOF
chmod +x "$BUNDLE/fastcode"
cat > "$BUNDLE/fastcode.cmd" <<'EOF'
@echo off
setlocal
set "DIR=%~dp0"
node "%DIR%package/bin/fastcode.mjs" %*
EOF
cat > "$BUNDLE/README-PORTABLE.md" <<'EOF'
# FastCode 免安装便携包

已内置依赖，解压后无需 npm install，只要有 Node.js 18.17 以上即可。

    chmod +x fastcode
    ./fastcode doctor
    ./fastcode

Windows:  fastcode.cmd doctor
直接调用:  node package/bin/fastcode.mjs doctor

详情见项目 docs/DEPLOYMENT.md 与 docs/CONFIGURATION.md。
EOF
echo "==> 打包"
( cd "$ROOT/release" && tar -czf "fastcode-portable-$VER.tar.gz" "fastcode-portable-$VER" )
echo "完成：$ROOT/release/fastcode-portable-$VER.tar.gz"
