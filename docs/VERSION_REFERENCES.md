# 版本号引用与升级清单

> 状态：2026-11-15。**`package/package.json` 的 `version` 是唯一权威源**；本文件只记录哪些位置允许硬编码、哪些必须用占位符/引用，以及一次版本升级要改哪里。
> 行号是当前工作树快照；下次先运行 `node scripts/version-anchors.mjs` 获取最新行号。

## 1. 规则

1. **唯一源**：`package/package.json` 的 `version`。`package-lock.json` 由 `npm version` 生成，不手改。
2. **允许硬编码当前版本**（仅以下 14 行）：发布说明标题、当前状态头、用户可见版本表、运维包版本。
3. **不硬编码**：
   - 安装命令用 `@beta` 或 `@<version>`；发布版本状态用 `npm view … dist-tags`。
   - 发布资产文件名、tag 命令、GitHub Release 命令用 `<version>` 占位符。
   - README 页脚、Known limitations 标题、文档表里的版本限定词不加版本。
   - 历史版本（0.1.8-beta.0 / 0.1.7 / 0.1.6）是历史，不随当前版本替换。
4. **状态 vs 版本**：`release/`、npm `beta`、`latest` 是发布状态，写“上一批/见 dist-tags”，不复制具体版本。

## 2. 当前锚点（14 行）

| 文件 | 行 | 角色 | 处理 |
|---|---:|---|---|
| `package/package.json` | 3 | 权威源 | 版本升级第一步 |
| `package/package-lock.json` | 3, 9 | 生成物 | `npm version` 自动更新 |
| `CHANGELOG.md` | 5 | 发布说明标题 | 新版本加 section |
| `docs/DEVLOG.md` | 4 | 当前工作树头 | 只保留一份快照 |
| `README.md` | 7 | 用户版本表 | 只改这一处 |
| `README.zh.md` | 7 | 用户版本表 | 只改这一处 |
| `package/README.md` | 31 | 包内当前树声明 | 只改这一处 |
| `PATCHES.md` | 1 | 修复清单标题 | 保留当前目标 |
| `AGENTS.md` | 11 | 项目身份 | 只改这一处 |
| `NOW.md` | 11 | 当前状态 | 只改这一处 |
| `PROJECT_INDEX.md` | 7 | 项目一行定位 | 只改这一处 |
| `RUNBOOK.md` | 18 | 运维包版本 | 只改这一处 |
| `脑图.md` | 5 | 当前基线 | 只改这一处 |

> `package-lock.json` 两行、`README`/`README.zh` 各一行；合计 14 行。

### 已改为占位符/引用（不要再写死）

| 位置 | 现在 |
|---|---|
| `README` / `README.zh` 安装命令、npm 状态 | `@beta` / `npm view … dist-tags` |
| `README` / `README.zh` 便携包、tag、Release 命令 | `<version>` 占位符 |
| `README` / `README.zh` 页脚、Known limitations 标题、文档表 | 不写版本 |
| `package/README.md` registry check、release 资产说明 | `npm view … dist-tags` / “上一批” |
| `docs/AUDIT.md` 标题 | “版本见 `package/package.json`” |
| `NOW.md` / `RUNBOOK.md` / `脑图.md` / `AGENTS.md` / `PROJECT_INDEX.md` 的重复状态 | 只保留一处当前版本，其余写“当前工作树/上一批” |

## 3. 升级步骤

```sh
# 1) 只改权威源 + lock（不要 git tag）
cd package
npm version <version> --no-git-tag-version

# 2) 更新允许硬编码的当前状态/发布说明位置
#    CHANGELOG / DEVLOG / README / README.zh / package README /
#    PATCHES / AGENTS / NOW / PROJECT_INDEX / RUNBOOK / 脑图

# 3) 查看剩余锚点（应只有上表 14 行）
cd ..
node scripts/version-anchors.mjs

# 4) 构建与回归
cd package
npm run build
node ../scripts/smoke-test.mjs
npm run verify:artifacts
node bin/fastcode.mjs --version
```

## 4. 不应出现的写法

- 把 `fastcode-portable-<version>.tar.gz` 这类资产名直接写死成具体版本；保留占位符。
- `npm install -g …@<version>` 写死具体版本；用 `@beta` 或 `@<version>`。
- 页脚、Known limitations 标题、文档表里加具体版本限定词。
- 把 `release/` 或 npm `beta` 的旧版本号当成当前版本。

## 5. 工具

`scripts/version-anchors.mjs` 是只读扫描器：

```sh
node scripts/version-anchors.mjs
node scripts/version-anchors.mjs --json
node scripts/version-anchors.mjs --version <version>
```

它扫描仓库文本文件 + 外层 `AGENTS/NOW/PROJECT_INDEX/RUNBOOK/脑图`，跳过 `.git`、`node_modules`、`release`、`config/refs`。
