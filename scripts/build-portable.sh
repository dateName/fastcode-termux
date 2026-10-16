#!/bin/sh
# 构建全部发布产物到 release/：
#   fastcode-portable-<version>.tar.gz    免安装便携包（含依赖）
#   fastcode-portable-<version>.zip       同上（系统有 zip 时生成）
#   datename-fastcode-termux-<version>.tgz  npm 包（npm pack 产物）
#   SHA256SUMS                            以上文件的校验和
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
RELEASE="$ROOT/release"
BUNDLE="$RELEASE/fastcode-portable-$VER"

echo "==> 清理 release/"
rm -rf "$RELEASE"
mkdir -p "$BUNDLE/package"

echo "==> 复制程序本体"
cp -R "$PKG/bin" "$PKG/dist" "$PKG/src" "$BUNDLE/package/"
cp "$PKG/package.json" "$PKG/tsconfig.json" "$PKG/LICENSE" "$PKG/README.md" "$BUNDLE/package/"

if [ -f "$BUNDLE/package/dist/cli.js" ]; then
  echo "==> dist/cli.js 自包含，跳过 npm install（无需依赖目录）"
else
  echo "==> 未找到 dist/cli.js，安装生产依赖（仅 runtime）"
  ( cd "$BUNDLE/package" && npm install --omit=dev --no-audit --no-fund )
fi

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
cat > "$BUNDLE/README-PORTABLE.md" <<EOF
# FastCode 免安装便携包 v$VER

已内置依赖，解压后无需 npm install，只要有 Node.js 18.17 以上即可。

    chmod +x fastcode
    ./fastcode doctor
    ./fastcode

Windows:  fastcode.cmd doctor
直接调用:  node package/bin/fastcode.mjs doctor

详情见项目 docs/DEPLOYMENT.md 与 docs/CONFIGURATION.md。
EOF

echo "==> 打包 portable tar.gz"
( cd "$RELEASE" && tar -czf "fastcode-portable-$VER.tar.gz" "fastcode-portable-$VER" )

if command -v zip >/dev/null 2>&1; then
  echo "==> 打包 portable zip"
  ( cd "$RELEASE" && zip -qr "fastcode-portable-$VER.zip" "fastcode-portable-$VER" )
else
  echo "==> 跳过 zip（未安装 zip 命令，可 pkg/apt install zip 后重跑）"
fi

echo "==> 生成 npm 包（npm pack）"
( cd "$PKG" && npm pack --pack-destination "$RELEASE" >/dev/null )

echo "==> 计算 SHA256"
(
  cd "$RELEASE" || exit 1
  FILES=""
  for f in "fastcode-portable-$VER.tar.gz" "fastcode-portable-$VER.zip" "datename-fastcode-termux-$VER.tgz"; do
    [ -f "$f" ] && FILES="$FILES $f"
  done
  # shellcheck disable=SC2086
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum $FILES > SHA256SUMS
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 $FILES > SHA256SUMS
  elif command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs"),c=require("crypto");for(const f of process.argv.slice(1))console.log(c.createHash("sha256").update(fs.readFileSync(f)).digest("hex")+"  "+f)' $FILES > SHA256SUMS
  else
    echo "跳过校验和（未找到 sha256sum / shasum / node）" >&2
  fi
)

echo ""
echo "完成，产物在：$RELEASE"
ls -1 "$RELEASE"
echo ""
echo "发布到 GitHub Release（示例）："
echo "  gh release create v$VER -t \"FastCode $VER\" \\"
echo "    release/fastcode-portable-$VER.tar.gz \\"
echo "    release/datename-fastcode-termux-$VER.tgz \\"
echo "    release/SHA256SUMS"
echo ""
echo "发布到 npm："
echo "  cd package && npm publish --access public"
