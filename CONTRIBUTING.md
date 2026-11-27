# Contributing

> 仓库内的精简贡献约束。**完整规则以工作区上级 `AGENTS.md` 为唯一权威源**；本文件只内联最常用的硬约束，避免 clone 后看不到规则。

## 先读

1. `AGENTS.md`（规则、验证要求、文档职责边界）
2. `docs/MODULES.md`（目录契约：新增/删除源码必须登记）
3. `docs/ARCHITECTURE.md`、`docs/CONFIGURATION.md`（行为与配置权威源）

## 硬约束

- 保持现有修复与 harness 改造；不要整体重写核心架构。
- 改 `package/src` 后必须：`npm run typecheck`、`npm run lint`、`npm run build`、`node scripts/smoke-test.mjs`、`node package/scripts/verify-artifacts.mjs`。
- **`package/dist/cli.js` 受 Git 跟踪**：源码改动必须重新 build 并提交新产物；否则 clone 后跑旧 bundle。
- 改 `AGENT_SYSTEM_PROTOCOL` 会改变模型行为；伪协议/原生 tools 必须可回退（`FASTCODE_TOOL_PROTOCOL=legacy|native|auto`）。
- 新增环境变量必须同步 `docs/CONFIGURATION.md` 与 `src/lib/diagnostics.ts`。
- 每类事实只设一个权威源；文档用摘要 + 链接，不复制正文。
- 原子落盘依赖同目录 tmp + rename；`~/storage/shared` 是 FUSE，失败要回退“备份 → 覆盖 → 还原 + mode”。
- 未执行/未验证的能力不得写成已确认；交付报告区分代码完成 / 测试通过 / 安装验证 / 用户验收 / 发布授权。
- **不要在未授权时 commit / push / 发布**；目录搬迁不与逻辑修复混在同一提交。
- **边界评审**：`src/agent/runner.ts`（`runAgent`）是执行引擎，不新增 mode 分支；未来模式必须做成配置/工作流定义，由 `runTask`/消费者编排（H3）。

## 目录契约

- 新增/删除 `package/src/**/*.ts` 必须同步 `docs/MODULES.md`。
- 依赖方向：入口 → 编排 → 领域 → 基础；跨层依赖必须在 MODULES 里说明理由。
- 已知受控上行：`config/store → agent/policy/defaults`（零依赖 defaults）、`lib/diagnostics → 各层`（诊断探针）。
- 同名文件不改名；用 `docs/MODULES.md` 的命名空间表区分。

## 验证入口（PC）

```sh
cd package
npm run typecheck
npm run lint
npm run build
node ../scripts/smoke-test.mjs
npm run verify:artifacts
```

Termux 真机验证见 `RUNBOOK.md`；便携包构建见 `scripts/build-portable.sh`。
