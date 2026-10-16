# 部署方法（含免安装）

目标平台优先级：Termux（Android） > Linux/macOS > Windows。
所有方式都要求已安装 Node.js 18.17 及以上。

## 0. 先确认 Node 与 git

    node -v      # 需要 v18.17.0 或更高
    git --version

Termux 安装依赖：

    pkg update -y && pkg upgrade -y
    pkg install -y nodejs git ca-certificates

    termux-setup-storage     # 可选但推荐：让 agent 能读写 ~/storage/shared

## 方式 A：从 Git 仓库一键安装（推荐）

仓库内已提交**自包含打包产物** `package/dist/cli.js`（esbuild 把 Ink/React/meow 等
依赖全部内联），因此克隆后无需 `npm install` 即可运行。

    git clone https://github.com/dateName/fastcode-termux.git
    cd fastcode-termux
    bash scripts/install.sh

脚本把 `package/dist/cli.js` 软链到 `$PREFIX/bin`（Termux）或 `~/.local/bin`，
**完全跳过 npm install**；只有产物缺失时才回退到 `npm install && npm run build`。

等价的手动方式（任选）：

    node package/dist/cli.js            # 直接运行打包产物
    npm install -g ./package            # 或用 npm 全局安装（bin 会优先加载 cli.js）
    cd package && npm install && npm link

## 方式 B：免安装便携包（Release 附件）

包里已带好依赖，解压后不需要 npm install。到 Release 页面下载
`fastcode-portable-0.1.5.tar.gz`（或 `.zip`，校验见 `SHA256SUMS`）。

发布包结构：

    fastcode-portable-0.1.5/
      fastcode            启动脚本（Linux/macOS/Termux）
      fastcode.cmd        Windows 启动脚本
      package/            程序本体，内含 node_modules
      README-PORTABLE.md  本方式说明

使用步骤：

    1) 把 fastcode-portable-0.1.5.tar.gz 传到设备
    2) 解压
         tar -xzf fastcode-portable-0.1.5.tar.gz
         cd fastcode-portable-0.1.5
    3) 直接运行
         ./fastcode --version
         ./fastcode doctor
         ./fastcode
    4) 想全局可用，做个软链接（可选）
         ln -s "$PWD/fastcode" "$PREFIX/bin/fastcode"     # Termux
         ln -s "$PWD/fastcode" /usr/local/bin/fastcode    # macOS

没有可执行权限时先 chmod：

    chmod +x fastcode

如果不想用启动脚本，也可以直接：

    node package/bin/fastcode.mjs doctor

Windows：

    fastcode.cmd doctor
    :: 或
    node package\bin\fastcode.mjs doctor

优点：不需要 npm、不需要联网、不污染全局目录。
注意：便携包里的依赖是纯 JS，跨系统通用，但 Node 必须各自安装。

## 方式 C：npm 全局安装

    npm install -g @datename/fastcode-termux
    fastcode --version

> 注意：npm registry 上的版本可能落后于本仓库。若安装后行为异常或版本不对，
> 请改用方式 A（克隆）或方式 B（便携包）。

## 方式 D：本地 tarball / npx

用本地 tarball 安装：

    npm install -g ./datename-fastcode-termux-0.1.5.tgz

临时试用（不安装）：

    npx @datename/fastcode-termux doctor

## 构建与发布（维护者）

一次性生成全部 Release 附件与 npm 包：

    sh scripts/build-portable.sh

产物在 `release/`：

    fastcode-portable-0.1.5.tar.gz       免安装便携包
    fastcode-portable-0.1.5.zip          同上（需系统有 zip）
    datename-fastcode-termux-0.1.5.tgz   npm 包（npm pack）
    SHA256SUMS                           以上文件的校验和

脚本步骤：复制 bin/dist 与元数据 ->（若含自包含的 dist/cli.js 则跳过依赖安装）
写入 fastcode / fastcode.cmd 启动脚本 -> 打 tar.gz/zip -> npm pack -> 计算 SHA256。
`dist/cli.js` 自带全部依赖且为纯 JavaScript、无平台原生二进制，因此同一份
便携包可在 Termux、Linux、macOS、Windows 通用，只有 Node 需各自安装。

发布：

    gh release create v0.1.5 -t "FastCode 0.1.5" \
      release/fastcode-portable-0.1.5.tar.gz \
      release/datename-fastcode-termux-0.1.5.tgz \
      release/SHA256SUMS

    cd package && npm publish --access public

维护自检：

    node scripts/smoke-test.mjs
    # 自检全部通过才退出码 0

## 配置 API Key

任选一个服务商（也可写完只改 config.json）：

    export DEEPSEEK_API_KEY=sk-...
    export ANTHROPIC_API_KEY=sk-ant-...
    export OPENAI_API_KEY=sk-...

持久化（Termux/Linux/macOS）：

    echo 'export DEEPSEEK_API_KEY=sk-...' >> ~/.bashrc

或进入 TUI 后用 /login 保存到 ~/.fastcode/auth.json。

## 选择主模型（三种等效）

    nano ~/.fastcode/config.json      # 方式一：改文件
    fastcode model deepseek-chat      # 方式二：命令行
    /model deepseek-chat              # 方式三：TUI 内

## 安装后校验

    fastcode --version      # 应输出 0.1.5
    fastcode doctor         # 检查 Node、平台、TTY、config/keys 路径、缺哪个 Key

## 更新

    cd ~/fastcode && git pull && bash scripts/install.sh   # 先 git pull 再软链（推荐）
    便携包：解压新版本目录，替换软链接指向
    本地： cd fastcode && git pull && bash scripts/install.sh
    npm：  npm install -g @datename/fastcode-termux@latest  # registry 可能落后于仓库
    检查： fastcode update

> 注意：`scripts/install.sh` 本身只做软链，**不会 git pull**；要更新必须先
> `git pull` 再跑安装脚本。

## 卸载

    npm uninstall -g @datename/fastcode-termux
    便携包：直接删除解压出的目录
    配置（可选）：rm -rf ~/.fastcode

## 没有 Node 怎么办

本项目是 Node 程序，必须有 Node 运行时。若设备无法安装 Node，
只能改用方式 A 之外的预编译二进制方案（当前版本未提供）。
