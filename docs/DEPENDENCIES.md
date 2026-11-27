# 依赖与插件说明

> 对象：`package/package.json`、`package/src`、`plugins/` 与 portable bundle
> 核验日期：2026-11-26
> 说明：本文件只记录依赖/插件的用途与边界；版本以 `package/package.json` 为准。

## 1. 运行时要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | `>=18.17` | `engines.node`；使用内置 `fetch`、`AbortController` |
| 操作系统 | Termux/Android、Linux、macOS、Windows | Ink TUI 需要真实 TTY；`--ui plain/json` 可无 TTY |
| shell | POSIX `sh`（Termux/Linux/macOS）或 Windows shell | resident shell 池与 `shell` 工具使用 |
| git | 可选 | `/worktree`、git diff 相关命令需要 |
| 外部编辑器 | 可选 | `/edit` 使用 `$EDITOR` / `$VISUAL` |
| Python / curl | 不需要 | 网络请求由 Node 内置 `fetch` 完成 |

## 2. 运行时依赖

| 依赖 | 用途 | 备注 |
|---|---|---|
| `ink`、`react` | TUI 渲染与组件模型 | 直接使用 |
| `ink-text-input` | Prompt 输入与光标 | 直接使用 |
| `ink-big-text`、`ink-gradient` | 启动横幅 | 直接使用 |
| `meow` | CLI 参数解析 | 直接使用 |
| `marked`、`marked-terminal` | Markdown 渲染 | 直接使用 |
| `chalk` | 终端颜色 | 直接使用 |
| `bash-parser` | shell AST 二次判断 | 直接使用；只升级 Hard Block，不替代 guards |
| `cli-highlight` | 代码高亮 | 由 `marked-terminal` 间接使用 |
| `boxen` | 终端框线 | 当前 `src` 无直接 import；由 UI/依赖间接使用或保留 |
| `figures` | 终端符号 | 当前 `src` 无直接 import |
| `gradient-string` | 渐变字符串 | 当前 `src` 无直接 import；主题梯度由 `ink-gradient` 渲染 |
| `ink-link` | 可点击链接 | 当前 `src` 无直接 import |
| `ink-markdown` | Markdown 组件 | 当前 `src` 无直接 import；实际使用 `marked` + `marked-terminal` |
| `ink-select-input` | 选择器 | 当前 `src` 无直接 import；实际使用自研 `ui/Picker.ts` |
| `ink-spinner` | Spinner 组件 | 当前 `src` 无直接 import；实际使用自研 `ui/Spinner.ts` |
| `tar` | 归档处理 | 当前 `src` 无直接 import；保留待用 |

> 审计方式：按 `package/src/**/*.ts` 的 `import/require` 与依赖名匹配。`NO DIRECT IMPORT` 不等于无用，可能被间接依赖或保留给后续功能；删除前需先跑 `npm run check` 与 portable smoke。

## 3. 构建与开发依赖

| 依赖 | 用途 |
|---|---|
| `typescript`、`@types/node`、`@types/react` | 类型检查与编译 |
| `esbuild` | 生成自包含 `dist/cli.js` |
| `tsx` | 开发时直接运行 TypeScript |
| `eslint`、`@typescript-eslint/*` | 静态检查 |
| `@types/marked-terminal` | Markdown 渲染类型 |

## 4. 打包与安装形态

- `package/dist/cli.js` 由 esbuild 生成，默认内联运行时依赖，只把 `node:*` 保持 external。
- 源码安装：`npm install` 需要完整 `dependencies` + `devDependencies`。
- 便携包：运行时只需要 Node 与 `dist/cli.js`；若要在便携包内跑 smoke，需要包内 `bash-parser` 等依赖。
- Git clone 直接运行：提交的 `dist/cli.js` 已包含运行时依赖，不需要 `npm install`。
- `package.json.files` 当前包含 `bin`、`dist`、`src`、`tsconfig.json`、`assets`、`README.md`、`LICENSE`；不包含 `scripts/`，因此 npm 包的 `npm test` 不能直接引用根目录 smoke 脚本。

## 5. 插件（plugin）不是 npm 依赖

插件是运行时的行为包，不通过 npm 安装，也不执行插件代码。

| 项 | 规则 |
|---|---|
| 全局目录 | `$FASTCODE_HOME/plugins/<name>/` |
| 项目目录 | `<cwd>/.fastcode/plugins/<name>/`；仅项目已信任时加载，并优先于同名全局插件 |
| manifest | 可选 `plugin.json`：`name`、`version`、`description`、`scope`（`global`/`project`）、`capabilities` |
| prompt 来源 | `PLUGIN.md`，缺失时回退 `README.md` |
| skills 来源 | 根 `SKILL.md` 或 `skills/<name>/SKILL.md` |
| 能力 | 只支持 `prompt`、`skills`；声明其他能力会在导入时拒绝 |
| 启用 | 导入后默认关闭；`/plugin enable <name>` 启用 |
| 注入 | 启用后把插件正文与 skills 拼进 system prompt；不执行任意代码 |
| 覆盖 | 导入同名插件会替换目标目录；目标目录写 `.fastcode-source` 记录来源 |
| 项目作用域 | `scope:"project"` 安装到项目目录；项目未信任时不加载 |

相关命令：`/plugin list|import|enable|disable|remove|info`。实现见 `src/plugins/manager.ts`，配置与路径见 `CONFIGURATION.md` §2.7，模块契约见 `MODULES.md`。

## 6. 相关文档

- 安装与部署：`DEPLOYMENT.md`、`RUNBOOK.md`
- 模块与依赖方向：`MODULES.md`、`ARCHITECTURE.md`
- 插件 manifest 与目录：`CONFIGURATION.md` §2.7
- 安全边界：`AUDIT.md`、`ARCHITECTURE.md` §5
