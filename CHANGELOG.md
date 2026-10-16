# 更新日志（Changelog）

本文件记录每个版本的用户可见变化。逐项的技术修复明细见 [PATCHES.md](PATCHES.md)。

## 0.1.6

发布时间口径：GitHub Release `v0.1.6`；npm 包 `@datename/fastcode-termux@0.1.6`（**首个发布到 npm 的版本**）。

> 说明：`0.1.5` 曾打过 GitHub tag，但那份是不完整的中途构建（缺少包名迁移、模型清单修复、DSML 支持等），也**未发布到 npm**。`0.1.6` 是这些改动的完整版本，并首次发布到 npm。

### ⚠️ 包名变更
- npm 包名由 `@simplelittledev/fastcode` 迁移为 **`@datename/fastcode-termux`**（发布到自有 scope）。
- 安装/卸载/更新命令随之更新；`README`、`docs/DEPLOYMENT.md`、`scripts/*`、`package/README.md` 同步。
- 历史致谢（原作者 SimpleLittleDev 与原 npm 链接）保留不变。

### 新增
- **API Key 作用域化**：Key 绑定到「服务商 + 模型」(`<provider>::<model>`)，只有当前 provider 与 model 同时匹配才使用；换模型不会误用别的 Key。旧 provider-only 键识别为 `legacy`，**不静默使用**，`doctor` 显示 `UNBOUND`。
- **引导式 `/login`**：服务商 → 模型 → Key（输入掩码）。保存后回显 服务商 / 模型 / Key 尾号（`sk-****abcd`）/ 文件路径。也支持一行式 `/login <provider> <model> <key>`。
- **发送前校验**：无可用 Key（或仅 legacy）时拦截并给出精确命令；服务商 401/403（鉴权）与 402/429（额度/限流）分开提示。
- **DSML 工具调用方言**：除 `<fastcode_tool>` 外，解析 DeepSeek 等模型的原生 `<｜DSML｜invoke …>` 标记（兼容 fullwidth/ASCII 竖线、重复/带空格、`calls`/`tool_calls`/`function_calls`、含不含外层块）。
- **实时模型列表为准**：`/models` 成功时只显示服务商当前返回的模型（已知的补标签/价格），离线/失败才回退内置清单。
- **Anthropic 实时模型列表**：`listModels` 先查 `/v1/models`，失败回退内置。
- **CI 自动发布 npm**：`.github/workflows/release.yml` 增加 `npm publish` 步骤（推 `v*` tag 或手动 Run workflow，需仓库 Secret `NPM_TOKEN`）。

### 变更
- 版本：`0.1.4` → **`0.1.6`**（`package.json`、`package-lock.json`、`README`、docs 全部对齐）。
- 安装口径：优先「克隆 + 软链自包含产物」或「便携包」；方式三改为明确的“从源码重建”路径；FAQ 说明 npm registry 可能滞后于仓库。
- 移除“上游仓库已删除”的措辞；删除香港大学（HKUDS）出处段落与相关说明。

### 修复
- **提示符光标前移**：`Prompt` 去掉 500ms 定时重绘（改为静态光标），避免首字符后光标偶发窜位。
- **下架模型长期残留**：`listModelsHttp` 不再把“内置里有、服务商已下架”的模型追加回去（例如 `deepseek-chat` 永不清除的问题）。
- **DeepSeek 内置/默认模型陈旧**：更新为 `deepseek-v4-pro` / `deepseek-flash`（以官方实时列表为准）。
- **DSML 工具调用不执行**：此前会被当普通文本显示，现能解析并真正执行。

### 分发
- `release/` 资产纳入版本库：`datename-fastcode-termux-0.1.6.tgz`、`fastcode-portable-0.1.6.tar.gz`、`SHA256SUMS`（`.gitignore` 只跟踪归档与校验和，忽略解压目录）。
- `release.yml`：Release 步骤仅在 `v*` tag 时执行；`npm publish` 步骤在 tag 或手动 Run workflow 且配置 `NPM_TOKEN` 时执行。

### 验证
- `npm run check` 全过（typecheck + lint + build + 冒烟，冒烟 **31 项**）。
- **真机实测**（LG V409N，Android 12，aarch64，Termux 0.118.2，node v26.4.0）：
  - 安装/`doctor`/`fastcode model` 正常；识别 Termux、stable UI；
  - 引导式 `/login`（服务商 → 模型 → 掩码输入）→ 保存回显 服务商/模型/`sk-****xxxx`/路径；
  - 作用域：精确命中 file、换模型回退出 env、无 env 则 `missing`（拦截）；
  - 实时模型列表只显示 `deepseek-flash`、`deepseek-v4-pro`；
  - 真实模型调用返回 `PONG`；DSML 解析自测通过。

### 涉及的主要文件
- `package/src/config/store.ts`、`src/commands/{login,logout,whoami}.ts`、`src/app.ts`、`src/ui/Prompt.ts`、`src/types.ts`
- `package/src/providers/{openaiCompatible,deepseek,anthropic}.ts`
- `package/src/agent/protocol.ts`
- `package/src/lib/{startup,diagnostics}.ts`、`src/cli.ts`
- `.github/workflows/release.yml`、`.gitignore`、`scripts/{smoke-test.mjs,build-portable.sh,update-termux.sh}`
- 文档：`README.md`、`README.zh.md`、`docs/{CONFIGURATION,DEPLOYMENT,ARCHITECTURE,MODULES}.md`、`PATCHES.md`、`package/README.md`

### 本版本提交
| Commit | 说明 |
|---|---|
| `ba65910` | Fix prompt caret jumping one column after the first keystroke |
| `4b1c040` | Docs: point users at the committed bundle, not npm; publish npm on tag |
| `208ed6e` | Scope API keys to provider + model, add guided /login, bump to 0.1.5 |
| `0ed90a7` | Rename the npm package to @datename/fastcode-termux |
| `a8b0d20` | Drop deleted-upstream wording and the HKUDS attribution |
| `1f19064` | Make the live /models list authoritative; refresh DeepSeek/Anthropic models |
| `bbb42c3` | Also parse DeepSeek's DSML tool-call dialect |
| `ea89317` | Add CHANGELOG.md summarizing the 0.1.5 changes |

> 更早的修复（0.1.3 → 0.1.4 及逆向重建源码树等）见 [PATCHES.md](PATCHES.md)。
