# 部署方法（含免安装）

目标平台优先级：Termux（Android） > Linux/macOS > Windows。
所有方式都要求已安装 Node.js 18.17 及以上。

## 0. 先确认 Node

    node -v      # 需要 v18.17.0 或更高

Termux 安装 Node：

    pkg update -y && pkg upgrade -y
    pkg install -y nodejs git ca-certificates

## 方式 A：免安装便携包（推荐给手机与 macOS）

思路：包里已经带好依赖，解压后不需要 npm install，直接跑。

发布包结构：

    fastcode-portable-0.1.6/
      fastcode            启动脚本（Linux/macOS/Termux）
      fastcode.cmd        Windows 启动脚本
      package/            程序本体，内含 node_modules
      README-PORTABLE.md  本方式说明

使用步骤：

    1) 把 fastcode-portable-0.1.6.tar.gz 传到设备
    2) 解压
         tar -xzf fastcode-portable-0.1.6.tar.gz
         cd fastcode-portable-0.1.6
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

## 方式 A 的构建（维护者）

便携包由脚本一键生成：

    sh scripts/build-portable.sh
    # 产物：release/fastcode-portable-0.1.6.tar.gz  与  .zip

脚本步骤：复制 bin/dist 与元数据 -> 安装生产依赖 -> 写入 fastcode / fastcode.cmd 启动脚本 -> 打包。
包内依赖为纯 JavaScript，无平台原生二进制（已扫描确认 0 个），
因此同一份便携包可在 Termux、Linux、macOS、Windows 通用，只有 Node 需各自安装。

维护自检：

    node scripts/smoke-test.mjs
    # 输出 10 项检查，全部通过才退出码 0

## 方式 B：npm 全局安装

    npm install -g @simplelittledev/fastcode
    fastcode --version

用本地 tarball 安装：

    npm install -g ./simplelittledev-fastcode-0.1.6.tgz

用本项目目录安装：

    npm install -g ./package

## 方式 C：从源码仓库安装

    git clone <你的仓库地址> fastcode
    cd fastcode
    npm install -g ./package

## 方式 D：临时试用（npx）

    npx @simplelittledev/fastcode doctor

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

    fastcode --version      # 应输出 0.1.6
    fastcode doctor         # 检查 Node、平台、TTY、config/keys 路径、缺哪个 Key

## 更新

    便携包：解压新版本目录，替换软链接指向
    npm：  npm install -g @simplelittledev/fastcode@latest
    本地： cd fastcode && git pull && npm install -g ./package --force
    检查： fastcode update

## 卸载

    npm uninstall -g @simplelittledev/fastcode
    便携包：直接删除解压出的目录
    配置（可选）：rm -rf ~/.fastcode

## 没有 Node 怎么办

本项目是 Node 程序，必须有 Node 运行时。若设备无法安装 Node，
只能改用方式 A 之外的预编译二进制方案（当前版本未提供）。
