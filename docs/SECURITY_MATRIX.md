# 安全攻击回归矩阵

> 对象：FastCode 的 sandbox、guards、egress、approval、session/raw、资源边界
> 核验日期：2026-11-26
> 执行入口：`node scripts/security-test.mjs` 或 `npm --prefix package run security`

## 1. 目标与边界

目标：把“攻击面”变成可重复的回归断言，而不是只靠 smoke 的正常路径。

只覆盖本地、离线、可重复的攻击面：

- 文件路径与符号链接/硬链接逃逸
- shell Hard Block / Soft Gate / 权限绕过
- 敏感文件与 egress
- 脱敏与 raw 路径
- session/resume/projection 路径
- 审批 fail-closed
- 输出/读取资源上限
- POSIX 文件权限
- 用户级 hooks（H1 pass 1：只读观察、env allowlist、不能阻断/审批/改工具结果；不是文件系统隔离）

当前不覆盖：

- 真实 provider 网络行为
- 操作系统级容器隔离
- Windows ACL / AppContainer
- Git hooks/config 的代码执行面（见 §5 已知缺口）
- 项目级 hooks（H1 pass 1 不支持；只支持用户级）
- 真实恶意模型输出

安全矩阵不替代 `AUDIT.md` 的威胁模型；它只把已确认的边界固定成回归。

## 2. 执行方式

在仓库根：

```bash
node scripts/security-test.mjs
```

在 `package/`：

```bash
npm run security
```

前提：`package/dist/cli.js` 已构建。矩阵只 import 编译产物，不启动真实 TUI、不访问外网、不读取用户 `~/.fastcode`。

隔离方式：

- 临时 `FASTCODE_HOME`
- 临时 workspace / outside 目录
- `FASTCODE_TRUST_ALL=1` 只用于让工具跑到 guard 层
- 结束后 best-effort 清理

退出码：0 表示全部通过；1 表示至少一条失败。

## 3. 当前矩阵

| 编号 | 攻击面 | 断言 | 状态 |
|---|---|---|---|
| SEC-PATH-01 | `../` 路径穿越 | `write_file` 返回 `SANDBOX_DENY` | 已覆盖 |
| SEC-PATH-02 | 绝对路径越界 | 不创建 outside 文件 | 已覆盖 |
| SEC-PATH-03 | 目录符号链接逃逸 | 不写入链接目标；无权限时 SKIP | 已覆盖（平台相关） |
| SEC-PATH-04 | 硬链接写入 | 新文件断开链接，outside inode 不变 | 已覆盖（平台相关） |
| SEC-PATH-05 | patch 路径逃逸 | `apply_patch` 返回 `SANDBOX_DENY` | 已覆盖 |
| SEC-SHELL-01 | 根目录递归删除 | Hard Block | 已覆盖 |
| SEC-SHELL-02 | fork bomb | Hard Block | 已覆盖 |
| SEC-SHELL-03 | `curl \| sh` | Hard Block | 已覆盖 |
| SEC-SHELL-04 | `base64 -d \| sh` | Hard Block | 已覆盖 |
| SEC-SHELL-05 | `printenv` 外传 | Hard Block `credential_exfil` | 已覆盖 |
| SEC-SHELL-06 | `.env` 外传 | Hard Block `sensitive_file_egress` | 已覆盖 |
| SEC-SHELL-07 | 权限 allow-all | 不能覆盖 Hard Block | 已覆盖 |
| SEC-SHELL-08 | `FASTCODE_ALLOW_DANGEROUS=1` | 不能覆盖 Hard Block | 已覆盖 |
| SEC-SHELL-09 | shell 语法损坏 | 不能让 Hard Block 降级 | 已覆盖 |
| SEC-DATA-01 | `.env` 覆盖 | `EGRESS_DENY` | 已覆盖 |
| SEC-DATA-02 | API key 识别 | sensitive detector 命中 | 已覆盖 |
| SEC-DATA-03 | API key 脱敏 | 原文不落盘，出现 `[REDACTED]` | 已覆盖 |
| SEC-DATA-04 | raw 落盘脱敏 | raw 文件不含明文 key | 已覆盖 |
| SEC-DATA-05 | `rawRef` 穿越 | `readRawOutput` 返回 undefined | 已覆盖 |
| SEC-SESSION-01 | resume 越界路径 | `resolveResumeFile` 返回 undefined | 已覆盖 |
| SEC-SESSION-02 | resume 裸 id | 解析到 sessions 目录 | 已覆盖 |
| SEC-SESSION-03 | projection 后缀 | `.JSONL` 映射稳定 | 已覆盖 |
| SEC-APPROVAL-01 | 大改动无 resolver | `APPROVAL_DENY` fail-closed | 已覆盖 |
| SEC-RESOURCE-01 | 输出上限 | view 截断但 `fullValue` 保留 | 已覆盖 |
| SEC-RESOURCE-02 | 超大读取 | 标记 `truncated` 且输出有界 | 已覆盖 |
| SEC-PERM-01 | 密钥文件权限 | POSIX 0600 | 已覆盖（仅 POSIX） |

## 4. 失败处理

- `SANDBOX_DENY` / `HARD_BLOCK` / `EGRESS_DENY` / `APPROVAL_DENY` 是预期拒绝，不得改成普通错误。
- 拒绝路径不得产生 side effect；测试会检查 outside 文件是否存在、硬链接内容是否变化。
- 平台能力不足（symlink/hardlink/POSIX mode）只能 SKIP，不能算 PASS；CI 的 Linux 应尽量覆盖。
- 失败时输出失败断言、实际错误码和关键对象；禁止只输出 “security failed”。

## 5. 已知缺口与后续批次

| 缺口 | 风险 | 计划 |
|---|---|---|
| Git hooks/config 代码执行 | 恶意仓库可通过 `core.pager`、`filter.*`、`alias !`、`include`、submodule 等执行命令 | 下一批增加 agent-shell 专用 git wrapper、危险 key 黑名单与回归 |
| Hooks pass 1 | 用户级 `*.mjs` 视为可信用户代码，拥有宿主文件系统权限；仅 env allowlist，无 FS 隔离；不是审批通道；项目级 hooks 不支持 | 保持只读观察；不把 hooks 接入阻断/审批；新增 hook 能力需评审 |
| push 分支限制 | force-push 已 Hard Block，但普通 push 未绑定任务分支 | 增加 `FASTCODE_GIT_PUSH_BRANCH_ONLY` 或任务分支护栏 |
| OS 级隔离 | 当前 shell 与 FastCode 同用户、同权限；guard 是应用层 | 评估 `FASTCODE_SANDBOX_BACKEND=none|podman|docker|proot`，默认 none，`doctor` 明示 |
| 网络域名策略 | egress 扫描内容，不是网络命名空间防火墙 | 先做 shell 出站域名 allow/deny 与速率/字节预算 |
| 内存/CPU/PID 上限 | 现有 timeout/output/spawn 上限，无 cgroup/ulimit 级隔离 | POSIX 可选 `ulimit`；容器后端再做硬限制 |
| Windows ACL | POSIX 0600 测试跳过，Windows 无 ACL 断言 | 增加 Windows 专属检查或明确不承诺 |
| 真实 provider 请求 | 本地 mock 不能证明供应商行为 | 用户真实 Key + 最小请求单独记录，不放进默认矩阵 |

## 6. 文件规划

当前保持单文件，便于 review 和 CI：

```text
scripts/security-test.mjs       # 当前矩阵（约 24 项）
docs/SECURITY_MATRIX.md         # 本文件：范围、矩阵、缺口、规划
```

增长到约 60 项后再拆分：

```text
scripts/security-test.mjs       # runner + summary
scripts/security/
  fixtures.mjs                  # 临时目录、链接、mock 工具
  path.mjs                      # SEC-PATH
  shell.mjs                     # SEC-SHELL
  data.mjs                      # SEC-DATA
  session.mjs                   # SEC-SESSION
  approval.mjs                  # SEC-APPROVAL
  resource.mjs                  # SEC-RESOURCE
  permission.mjs                # SEC-PERM
```

原则：不引入外部测试框架；每个用例返回结构化结果；fixture 不进入仓库产物；不依赖真实网络。

## 7. CI 接入

`Verify` workflow 在 `npm run check` 后运行：

```bash
npm --prefix package run security
```

它不并入 `npm run check`，避免普通本地提交被平台相关 SKIP 干扰；安全相关改动（guard / shell / trust / egress / sandbox / session path）必须单独运行并记录结果。

## 8. 版本化

- 矩阵编号稳定，不复用；新增只追加。
- 删除用例必须同时更新本文件并说明原因。
- 平台 SKIP 必须在报告中保留，不得静默当成通过。
