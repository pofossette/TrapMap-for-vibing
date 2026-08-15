# Task 4 Report: hosts 死代码与死依赖删除

Status: DONE
Date: 2026-08-15

## 完成项

1. **删除 `packages/host-local/src/nest/runtime/validation.pipe.ts`**
   - 全仓 grep `validation.pipe|ZodValidationPipe|ZodBodyValidationPipe` 仅命中文件自身（3 处），零外部引用（含测试），确认死文件。
   - 删除后 `rg "validation.pipe" packages -g '*.ts'` 零命中；knip Unused files 清单中该文件消失。

2. **依赖移除（3 项）**
   - `@sentry/node`：仅从 `packages/host-distributed/package.json` 移除。grep 核实 host-distributed 全 src 零 import；host-local 保留——其 `src/nest/observability/sentry.service.ts:192` 有动态 `await import('@sentry/node')`（需注意：字面 `from '@sentry/node'` 匹配不到动态 import）。
   - `@trapmap/client-core`：从 host-local 与 host-distributed 两 package.json 移除，两 host src 零 import（host-distributed 的 Dockerfile/dockerfile.test.ts 仍引用 client-core COPY，属于镜像构建冗余，超出本 brief 范围，未动）。
   - `pnpm install` 已更新根 `pnpm-lock.yaml`（-9 行，4 个 importer 条目）。

3. **`/v1/auth/register` 死允许项**
   - `packages/host-distributed/src/gateway/routes.ts` PUBLIC_PATHS 移除该项。全仓核实无 register 路由（service-identity-access 仅有 login/system-admin-login/logout/validate/select-team）。
   - **偏差（用户预期 vs 实际）**：`rg "v1/auth/register" packages` 并非只命中 routes.ts——`packages/host-distributed/README.md:95` 公共 API 表也记录了该不存在路由。已同步删除该 README 行（文档-API 一致性），与"死允许项移除"同属死面清理。

4. **`normalizeRoleTemplate` 消重**
   - `backend-core-adapters.ts:20-25` 与 `auth-context.ts:8-13` 逐字重复，签名均为 `(role: unknown) => RoleTemplate`。
   - auth-context.ts 原版本**未导出**（无 `export`），故加 `export` 关键字（唯一改动，未动业务逻辑）；backend-core-adapters.ts 删除本地实现改为 `import { normalizeRoleTemplate } from './auth-context.js'`，并顺带移除不再使用的 `RoleTemplate` type import。
   - 无循环依赖：auth-context → host-services/permissions，无回边。

## 附带修复：vitest.config.ts fastify 别名漂移

- 失败现象：host-local 11 个测试套件 `Cannot find module 'fastify'`。
- 根因：`vitest.config.ts:8` 硬编码 `fastify@5.8.4`，而 lockfile 已解析 `fastify@5.8.5`；主仓库因 store 残留旧 5.8.4 目录侥幸通过，全新 worktree 安装必然失败。与本任务改动无关的既有漂移，但阻塞必要验证。
- 修复：`vitest.config.ts` 别名更新为 `fastify@5.8.5`（与 lockfile 对齐，1 行）。

## 验证结果

| 命令 | 结果 |
|---|---|
| `rtk pnpm --filter @trapmap/host-local test --run` | PASS 27 files / 209 tests |
| `rtk pnpm --filter @trapmap/host-distributed test --run` | PASS 25 files / 136 tests |
| `rtk pnpm typecheck` | PASS（No errors found） |
| `rtk pnpm exec knip` | 无新增项；validation.pipe.ts 消失、hosts 无 unused deps（剩余 14 unused files / 4 unused deps 均为既有，属其他包） |
| `rtk pnpm check:docs` / `rtk pnpm check:structure` | PASS |

环境备注：worktree 为全新安装（`pnpm install --force` 后 node_modules 才完整）；host-distributed 的 distributed-runtime-closeout 测试需要 workspace dist 构建，已用 `rtk pnpm exec tsc -b packages/...` 构建 backend-core + 各 service + host-distributed（dist 为 gitignored 产物）。

## Commit

`refactor(hosts): drop unused deps and dead validation pipe`

## 疑虑

1. **README 同步超出 brief 字面范围**：brief 只列 routes.ts，但 README 记录了不存在路由，按文档一致性删除；若策略要求最小字面变更，可回退该行。
2. **vitest.config.ts fastify@5.8.4→5.8.5**：本任务间接暴露的既有漂移修复，主仓库 CI 在全新 install 下同样会挂；建议另行确认归属。
3. **host-distributed Dockerfile 仍 COPY client-core**（含 dockerfile.test.ts 断言）：依赖移除后镜像内属冗余但无害，留给后续镜像清理任务。
