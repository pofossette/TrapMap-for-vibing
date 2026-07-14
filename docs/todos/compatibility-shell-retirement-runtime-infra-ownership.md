# Compatibility Shell Retirement and Owner-Local Infrastructure 收口

> **状态：** active  
> **根入口：** [`../../plan.md`](../../plan.md)  
> **实施路线图：** [`../superpowers/plans/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership.md`](../superpowers/plans/2026-07-13-compatibility-shell-retirement-runtime-infra-ownership.md)

## 目标

将 `@trapmap/server`、`@trapmap/runtime-infra`、Fastify compatibility routes 与 `store_snapshot` 的具体实现按领域迁移至其真实 service owner；`packages/contracts` 与 `packages/backend-core` 保持唯一共享 domain/port 层。

## 已满足的启动条件

- [x] 可观测性、shared PG 治理与 distributed maturity 主线已归档；Compose restart closeout 已通过。
- [x] 根 `plan.md` 将本文件指定为唯一 active mainline detail。
- [x] 既有路线图冻结了 owner wave、PG-first cutover、empty database 与 legacy snapshot backfill 的验收边界。

## 执行约束

- 不保留 compatibility re-export、dual read 或 runtime fallback；每个 wave 完成后立即移除其运行时 import。
- service 之间不得导入其他 service 的具体实现；跨 owner 行为仅经 `backend-core` ports、内部 HTTP adapter 或 outbox delivery。
- 不新增 `store_snapshot`、shared DB direct-read 或 `runtime-infra -> server` 依赖作为默认业务路径。
- 每个 wave 遵循路线图中的 TDD、最小验证、文档回写和 evidence checklist；本文件记录实际命令结果与外部前置条件。

## 当前执行入口

- [x] 建立 Task 1 deletion contract：[`compatibility-retirement-guard.test.ts`](../../scripts/__tests__/compatibility-retirement-guard.test.ts) 扫描生产 TypeScript、Dockerfile、根脚本与 workspace manifest；测试、spec 和 fixture 不构成新增阻断面。
- [x] Task 2 migration baseline：六个 owner-local baseline 仅支持空数据库；旧 `0000–0020` 数据库须重建，不提供原地升级。`identity-access` 暂管 `store_snapshot`，仅作为 Task 9 一次性 backfill 输入；Task 9 完成导出、回填与核对后必须删除该表及其迁移资产。已通过六个 service 的 `src/migrations.test.ts`：每个 runner 均拒绝 owner-external SQL 和缺失 journal tag；host coordinator 的顺序、失败停止与 pool close 覆盖保留在 `packages/host-distributed/src/migrate.test.ts`。
- [ ] 每完成一个 owner wave，回写迁移范围、已删除 compatibility surface、focused tests、Fallow boundary audit 与 typecheck 结果。
- [ ] 所有 wave 完成后执行 empty-database migration、legacy snapshot backfill、distributed acceptance 与 closeout，并归档本文件。

## Task 1 — Deletion contract evidence

`scripts/__tests__/compatibility-retirement-guard.test.ts` 是临时 allowlist 的权威记录。每个对象均为精确的 `{ file, symbol, ownerWave, rationale }` 删除契约；guard 拒绝未登记的生产命中、过期文件、未知标识符、缺失 owner/rationale，以及已完成 wave 遗留的条目。不得使用目录、包或 glob 级豁免。

| Owner wave | 当前例外与删除条件 |
| --- | --- |
| wave-1 identity-access | `auth/users/teams/audit` 的旧 snapshot 注记与 identity migration fixture 已不再是 guard 例外；唯一允许的 snapshot 输入是 service-local `IdentityAccessSnapshotPort`，仅供 Task 9 backfill 使用。完整 repository aggregate 迁移仍未完成。 |
| wave-2 knowledge-write | artifact/knowledge/lifecycle 的 `JsonStore` 与 snapshot fallback；PG-first write path 落地即删除。 |
| wave-3 candidate-ingestion | candidate/lineage snapshot fallback；candidate owner 完成即删除。 |
| wave-4 governance-review | feedback snapshot 注记与 badcase export；governance owner 完成即删除。 |
| wave-6 job-runtime | runtime-infra outbox bridge；job runtime 接管后删除。 |
| wave-7 knowledge-read | retrieval schema 和 service knowledge-read 对 runtime-infra/server 的依赖；read owner 完成即删除。 |
| wave-8 host surfaces | host composition、migration entrypoint、capability config；host-owned runtime surface 完成即删除。 |
| wave-9 backfill/delete state | `store_snapshot`、`JsonStore`、`PostgresStore` 与明确的 migration/export/benchmark fixture；完成一次性 backfill 后删除。 |
| wave-10 package retirement | root/runtime-infra dependency、repository aggregate、Docker compatibility self-reference；删除 packages 后移除。 |

已执行：guard 先以空 allowlist 运行，基线报出 68 个未登记生产依赖（预期 RED）；加入精确条目后 `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts` 通过（4 tests，GREEN）。同轮通过 `rtk pnpm test:file -- scripts/__tests__/closeout-surface.test.ts`（8 tests）、`rtk pnpm check:arch-freeze`（9 rules）、`rtk pnpm exec fallow list --boundaries`、`rtk pnpm exec fallow audit --base main`（18 changed files, no issues）、`rtk pnpm check:docs-drift`（46 rules）及 `rtk pnpm check:structure`。Fallow 保留一个既有 `../../tsconfig.base.json` entry-point 警告，但审计成功。

## Task 2 / Task 3 evidence

- Task 2：`rtk pnpm --filter @trapmap/service-identity-access test --run src/migrations.test.ts`，以及 candidate-ingestion、governance-review、job-runtime、knowledge-read、knowledge-write 的同名 focused test 全部通过（15 tests）。迁移集合校验已共享到 `@trapmap/backend-core`，每个 owner 仅声明自己的唯一 tag。
- Task 3：`service-identity-access` 新增 owner-local PostgreSQL identity port factory 和本地 Drizzle schema；它不再导入 `@trapmap/server`。distributed identity host 直接使用该 factory；host-local 仅接收由 identity service package 构造的 `IdentityAccessPort`。`rtk pnpm --filter @trapmap/service-identity-access test --run src/pg-ports.test.ts src/routes.test.ts src/migrations.test.ts`（7 tests）、`rtk pnpm --filter @trapmap/host-local test --run src/nest/app.test.ts`（7 tests）和 `rtk pnpm typecheck` 均通过。
- `rtk pnpm exec fallow audit --base main` 成功，无 boundary violation；报告 server 与新的 owner-local identity schema 之间的迁移期重复，待 compatibility server 在后续 owner waves 删除时一并消除。
- Wave-1 follow-up：identity service 的 PG factory 现在提供 audit query、actor lookup 和唯一的结构化 `IdentityAccessSnapshotPort` 兼容输入；该 port 不引用 server store 类型，提供 read、transaction 与 identity ID allocation，并明确只服务 Task 9 前的 backfill。`buildUserLookupContextFromRepos` 与 `createAuditEvent` 也已作为 identity-owned API 准备给迁移后的 knowledge owner 使用。兼容 server 当前不能直接导入 service implementation（Fallow `server → service-standard` boundary）；因此既有 server call sites 保持原边界，随 knowledge owner wave 经 port 完成切换。
- Follow-up evidence：`rtk pnpm --filter @trapmap/service-identity-access test --run src/pg-ports.test.ts src/routes.test.ts src/migrations.test.ts`（11 tests）、`rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`（4 tests）、`rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure` 均通过。Wave-1 guard 目前没有 allowlist 例外；runtime-infra repository aggregate 与 server compatibility repository implementation 仍未删除，不能将完整 wave 标记为完成。
- Wave-1 owner-bundle follow-up：`service-identity-access` 现提供结构性 `createIdentityAccessOwnerBundle`；host-local 的 Nest identity module 与 audit capability 均由 PG owner bundle 注入，缺少 pool 时 fail-fast。distributed shared `createServicePorts()` 不再创建或返回 identity/audit repositories；每个业务 host 从 identity owner factory 注入 append-only audit capability。server compatibility repositories 与 runtime-infra aggregate 仍待删除，因此 Wave-1 继续保持未完成。
- 本轮证据：`rtk pnpm --filter @trapmap/service-identity-access test --run src/pg-ports.test.ts src/routes.test.ts src/migrations.test.ts`（12 tests）、`rtk pnpm test:file -- packages/host-local/src/nest/app.test.ts`（7 tests）、`rtk pnpm test:file -- packages/host-distributed/src/shared/database-ownership.test.ts`（7 tests）、`rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`（4 tests）、`rtk pnpm typecheck`、`rtk pnpm check:docs-drift` 与 `rtk pnpm check:structure` 均通过。`rtk pnpm exec fallow audit --base main` 完成但仍报告既有 shared ports/audit complexity 与一个 service-local snapshot adapter complexity；未新增 boundary violation。

## Deferred 边界

平台化、物理 database isolation/PgBouncer、工程维护热点和未证实安全候选仍由 [`open-debt-and-compromises.md`](open-debt-and-compromises.md) 管理，不得与本主线并行启动。
