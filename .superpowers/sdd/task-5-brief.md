## Task 5 — Wave-3 in-progress evidence

`service-candidate-ingestion` 现拥有 owner-local Drizzle candidate schema 和 `createCandidateIngestionPgOwnerBundle`。该 bundle 在单个 PostgreSQL transaction 中处理 candidate 状态、analysis、duplicate case/matches 和 manual result，并为 resolution outcome、lineage 提供幂等写入；重试不会重写既有状态或子表记录。distributed candidate host 与 host-local Nest composition 都直接注入该 bundle，candidate review 的读取也使用同一个 owner port，而不再经 shared `createServicePorts()` 或 host-local compatibility candidate repository。owner package production sources 与 candidate host scan 均禁止导入 `@trapmap/server` 或 `@trapmap/runtime-infra`。

本轮 focused 验证：`rtk pnpm --filter @trapmap/service-candidate-ingestion test --run src/pg-ports.test.ts src/migrations.test.ts src/routes.test.ts`（23 tests）、host-local owner composition/review tests（4 tests）、distributed candidate route test、`rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`（16 tests）、`rtk pnpm typecheck` 与 `rtk git diff --check` 均通过。Wave-3 仍未完成：server/runtime-infra compatibility candidate repositories、duplicate/lineage services 和 candidate worker 尚待迁移或删除；Docker daemon 缺失时也不能宣告 deployment/eval acceptance 已完成。

本轮 owner-domain 增量：candidate duplicate detector 现通过 service-local `CandidateCorpusReadPort` 读取获批 corpus，不导入 knowledge/artifact service 实现或直读其表；exact duplicate 的 fingerprint、analysis snapshot 与 case 都由 candidate owner 生成。candidate resolution、manual-result 与 publish internal routes 仅接受 gateway 的 `x-trapmap-actor-id`，缺失 trusted actor 返回 401，body actor 与该身份不一致返回 403；distributed gateway 以认证 actor 覆盖 body 值并转发该 header。TDD RED 为未传身份时 route 返回 200；修复后 candidate owner focused suite（26 tests）、gateway routes（23 tests）和 package typecheck 通过。`rtk pnpm exec fallow audit --base wave1-fallow-base --gate new-only --format json --quiet` 无新增 dead-code 或 boundary violation，但仍报告 2 个新增 complexity 与 12 个新增 duplication group，因此不通过且不可作为 Wave-3 closeout evidence。该增量不改变 Wave-3 未完成判断：legacy worker、公开 gateway compatibility、server/runtime-infra 删除与 distributed/host-local acceptance 仍待完成。

## Deferred 边界

平台化、物理 database isolation/PgBouncer、工程维护热点和未证实安全候选仍由 [`open-debt-and-compromises.md`](open-debt-and-compromises.md) 管理，不得与本主线并行启动。
