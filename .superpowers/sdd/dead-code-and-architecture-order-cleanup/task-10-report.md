# Task 10 Report: SQL 落位修正（domain 纯净）

**Status:** DONE
**Date:** 2026-08-15

## 目标

把 `backend-core/src/job-runtime/domain/policy.ts` 中的 SQL 方言字符串常量移到 `service-job-runtime`，恢复 domain 纯净（零 DB 依赖）。

## 改动清单

### 移动（backend-core domain → service-job-runtime）

从 `packages/backend-core/src/job-runtime/domain/policy.ts` 移除以下 8 个常量（原有 12+ 的估算含派生项，实际清单以代码为准）：

- `TASK_DEDUPE_TARGET_STATUSES`（仅用于渲染 dedupe SQL 的目标状态数组，随 SQL 一起移动）
- `TASK_DEDUPE_SQL_CONDITION`
- `TASK_CLAIMABLE_SQL_CONDITION`
- `TASK_RECLAIM_SQL_CONDITION`
- `TASK_REQUEUE_SQL_CONDITION`
- `OUTBOX_CLAIMABLE_SQL_CONDITION`
- `OUTBOX_RECLAIM_SQL_CONDITION`
- `OUTBOX_FAIL_STATUS_SQL`

移入 `packages/service-job-runtime/src/async-runtime.ts` 新增的 "Authoritative SQL condition rendering (owner-local postgres dialect)" 区块（常量从 domain 的状态枚举渲染，语义不变）。`async-runtime.ts` 的 backend-core import 清单移除 7 个 SQL 常量，新增 `OUTBOX_STATUS_FAILED`（渲染 `OUTBOX_FAIL_STATUS_SQL` 所需）。

### 保留（domain 纯策略，未动）

- 状态枚举：`TASK_STATUS_*`、`OUTBOX_STATUS_*`
- 纯策略常量：`TASK_DEFAULT_PRIORITY`、`TASK_DEFAULT_MAX_ATTEMPTS`、`TASK_LEASE_MS`、`OUTBOX_LEASE_MS`、`TASK_RETRY_BASE_DELAY_MS`、`OUTBOX_MAX_ATTEMPTS`、`OUTBOX_CLAIM_BATCH_SIZE`、`OUTBOX_POLL_INTERVAL_MS`
- 纯函数：`isRetryExhausted`、`retryBackoffMs`、`statusAfterTaskFailure`
- 同步更新了 policy.ts 头部注释（不再声明 SQL-condition 常量，改为指向 service-job-runtime 负责渲染）。

### 测试

- `policy.test.ts`：移除 8 个 SQL 相关 import 与 3 个 SQL 断言用例（dedupe targets、SQL conditions 渲染、fail status SQL），保留其余纯策略断言。
- `async-runtime.test.ts`：新增 `describe('job-runtime SQL condition rendering')`，从 `./async-runtime.js` 直接导入并断言 8 个 SQL 常量的渲染结果（与原 policy.test.ts 断言值完全一致）。

## 验证

| 命令 | 结果 |
|---|---|
| `rtk pnpm --filter @trapmap/service-job-runtime test --run` | 7 files / 28 tests passed |
| `rtk pnpm --filter @trapmap/backend-core test --run` | 26 files / 173 tests passed |
| `rtk pnpm typecheck` | No errors found |
| `rtk pnpm exec fallow audit --base main` | ✓ No issues in 5 changed files；dead exports 0.0% |

## 环境备注（非本次改动引入）

1. worktree 的 `node_modules` 初始缺失 graphology 等符号链接（`.npmrc` store 路径 `.pnpm-store` 重建），导致测试全挂。已执行 `pnpm install --config.confirmModulesPurge=false` 修复（安装输出正常，无 lock 变更）。
2. `packages/contracts`、`packages/backend-core` 的 `dist/` 在 worktree 中缺失；包级 vitest 配置无 alias，自引用 import（`@trapmap/contracts`/`@trapmap/backend-core`）依赖 `dist`。已执行根级 `rtk pnpm build`（tsc -b）后相关用例通过。fallow audit 报告的 async-runtime.ts 大函数/高复杂度（`createPostgresTaskQueue` 142 行等）为存量问题，本次改动未引入。

## Commit

- `refactor(job-runtime): move SQL constants out of domain`（代码+测试）
- `chore(sdd): add task 10 report`（本报告）

## 疑虑

- brief 说"12+ SQL 常量"，实际代码中是 7 个 SQL 字符串常量 + 1 个支撑数组（`TASK_DEDUPE_TARGET_STATUSES`），已全部移出；数量差异可能是审查报告口径不同，无遗漏。
- SQL 常量从 domain 导出改为 async-runtime.ts 内导出（未加入 service 包 `index.ts` 聚合导出），仅包内消费者与测试引用，公开面最小。
