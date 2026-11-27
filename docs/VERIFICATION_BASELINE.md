# 验证基线（唯一计数源）

> 状态：2026-11-27；只记录“最近一次实际执行”的结果。
> 本文件是 smoke / security / bundle / POSIX / Termux 计数的**唯一真相源**；其他文档只引用本文件，不复制数字。
> 版本号仍以 `package/package.json` 为唯一源；发布状态以 npm / GitHub 实际查询为准。

## 1. 当前基线

| 项 | 结果 | 范围 / 备注 |
|---|---|---|
| Windows smoke | **547/547** | 2026-11-27，Windows，Node 24.20.0；含 H2 logPath 断言 |
| H1 hook tests (H1a-1 + H1a-2 + H1a-3 + H1b) | **13 passed** | 2026-11-27，Windows；9 runTask + 2 headless CLI + 2 H1a-2 mtime；含 soft/hard/load-error/default-off/tool-event/IPC-readback |
| H1a-2 TUI host mtime | **PASS** | 2026-11-27；签名不变复用（load=1/1）；mtime 变化重启（load=1/2）；Windows + Termux |
| H1a skeleton → H1a-2/H1b/H1c（默认关）`--ui json` baseline | **IDENTICAL** | 2026-11-27；临时骨架副本 2,252,835 vs 当前 2,256,678；删除 `ts`/`session_id` 后 sha256 `84a324a6…`；默认关；TUI pty 见下行 |
| H1 TUI pty baseline vs current | **PASS** | 2026-11-27；H1a-2 后 H1c/默认关复跑；H1c `TUI HOOKS PASS`；默认关 `TUI PTY IDENTICAL`（过滤 Script/node 元数据）；无 crash/残留；`~/.fastcode` UNCHANGED |
| H1b/H1c + H1a-2 wiring | **PASS** | 2026-11-27；headless CLI 2 tests PASS；H1c hook TUI PASS；默认关 TUI PASS；TUI warm host mtime 复用/重启 2 tests PASS |
| H2 logPath / dir contract | **PASS** | 2026-11-27；`logPath` dirname = `<root>/sessions` 且文件存在；`state/` 预留不创建；smoke 547/547 |
| H3 engine / orchestration boundary | **PASS（docs）** | 2026-11-27；ARCHITECTURE/SDK/CONTRIBUTING 边界规则；复用 M3/M4 断言 |
| Termux H1 demo | **PASS** | 2026-11-27；D1 270ms / D2 1774ms / D3 3021ms；env 无密钥、stdout 干净、SIGKILL 无残留；本地 H1a-1 dist（18:49；SIGKILL 日志为 19:59 构建） |
| Termux H1 spike + D4/D6 + 13 tests | **PASS** | 2026-11-27；spike 10 PASS（patched）；D4/D6 PASS；13/13 hook-tests（10.22s）；H1a-2 mtime；D5 lazy via spike；D3 已清；testkit 需 node_modules（软链 beta.1） |
| POSIX smoke | **547（预计）** | 未实跑 |
| Termux | **281（历史）** | 2026-11-06 记录，未复跑 |
| 0.1.6-beta 历史 | 212 | 仅历史记录 |
| bundle | **2,256,678 bytes** | `dist/cli.js`（H1a-2/H1b/H1c 后） |
| security | **24 passed / 0 failed / 24 checks** | Windows；2 SKIP：symlink、POSIX mode |
| `verify:artifacts` | PASS | 5 guard markers |
| `verify:gate --self-test` | PASS | |
| SDK 包内容 | `dist/lib.js` / `dist/lib.d.ts` / `dist/public/types.d.ts` | `npm pack --dry-run`；`prepack` 触发 build |
| 版本 | 0.1.9-beta.2 | 已提交/推送；npm beta.2 未发布 |
| npm dist-tags | latest=0.1.8；beta=0.1.9-beta.1 | 2026-11-27 查询；beta.2 未发布 |
| GitHub Release | **v0.1.9-beta.2（prerelease）** | 2026-11-27；4 个附件（tar.gz/zip/tgz/SHA256SUMS）；由 tag workflow 构建 |
| `release/` | 0.1.9-beta.1 历史资产 | 本地未重建；beta.2 资产在 GitHub Release |

## 2. 复跑命令

```bash
cd package
npm run typecheck
npm run lint
npm run build
npm test
npm run security
npm run verify:artifacts
npm run verify:gate -- --self-test
npm pack --dry-run
```

## 3. 更新规则

- 只有本文件可以写具体计数；README / AGENTS / ARCHITECTURE / MODULES / AUDIT / ERROR_SEMANTICS / NOW / PROJECT_INDEX / RUNBOOK / 脑图 / PATCHES 等一律写“见 `fastcode/docs/VERIFICATION_BASELINE.md`”，不复制数字。
- 更新时必须同时写：日期、OS、Node 版本、命令、结果；未实跑必须标“预计/未实跑”，历史记录必须标“历史”。
- 不得把 POSIX/Termux 的预计值写成已通过；不得把历史值写成当前值。
- 版本号不在本文件定义；见 `package/package.json`。
- 中文品牌：本文件位于 `fastcode/docs/VERIFICATION_BASELINE.md`（仓库根 `fastcode/fastcode`）。
