# Dead Code And Architecture Order Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **状态：** active
> **根入口：** [`../../plan.md`](../../plan.md)
> **设计规格：** [`../superpowers/specs/2026-08-15-dead-code-and-architecture-order-cleanup-design.md`](../superpowers/specs/2026-08-15-dead-code-and-architecture-order-cleanup-design.md)

**Goal:** 删除全仓确认的死代码/死路径（约 3000+ 行），修复双份表定义与循环依赖，落地防复发守卫，守住 RouteDef/domain/pg-owner 架构秩序。

**Architecture:** 按"纯删除（最大并行）→ 结构修复（按包并行）→ 守卫落地（顺序）"三波推进。Wave 1 只做全仓 grep 验证过零消费者的删除，零语义变化；Wave 2 修复表双份/循环依赖/SQL 落位；Wave 3 落地表清单 diff、pgTable 双份、eval import 边界、`@eval-only` 标记与 knip entry 守卫。每任务以 focused test + typecheck + fallow audit 验证，行为不变为硬约束。

**Tech Stack:** TypeScript, Zod, Vitest, Biome, knip, fallow, pnpm, GitHub Actions.

## 任务背景

2026-08-15 六路并行架构审查确认了约 3000+ 行零消费者死代码（backend-core use-cases/ 四文件、telemetry-ports、runtime/status|topology|route-surface、contracts async.ts ~800 行、operations.ts 死段、20+ 死 RequestSchema、graph-query 11 死函数、service 三包 eval-only 模块、六包 schema.ts/drizzle.config.ts 孤儿、hosts 死依赖与死文件、web-panel 误提交构建产物、evals 双轨 runner），以及一批结构问题（candidates 表双份定义、knowledge-write↔knowledge-read 循环依赖、SQL 落进 backend-core domain、internal-client 双组重复、DATABASE_SCHEMA.md 62→64 漂移）。本主线先做零风险的删除，再修结构，最后把"防复发"变成可验证的守卫，避免同类漂移再次发生。

## 全局约束

- **行为不变：** 纯删除任务不得改变任何保留代码的运行时语义；删除前必须全仓 grep 确认零消费者（排除测试与自身）。
- **契约包纯净：** `contracts` 只保留 schema + 纯类型；可执行逻辑（图算法、parsing、worker 控制器）下沉到消费方，禁止在 contracts 新增运行时逻辑。
- **domain 纯净：** `backend-core/src/<context>/domain/` 零框架、零 DB、零 SQL；SQL 常量留在 service 包。
- **宿主不写业务：** 宿主层禁止新增业务判断；本主线不重写宿主业务逻辑，只删除宿主死代码与死依赖。
- **eval-only 标记：** 产品零消费、仅 eval 引用的模块统一标记 `@eval-only` 并从产品公共导出面移除。
- **禁止断言：** 不新增 `@ts-ignore`/`@ts-expect-error`/裸 `as`；删除时同步清理因删除而失效的断言与豁免。
- **禁止大规模重构：** 不在本主线做 capability-model 拆分、OTel/Consul 双份收敛、EvalSeedPort 收窄、web-panel real 路径实现；这些进入 debt register 记录后续落点。
- **验证门禁：** 每任务 focused test + `rtk pnpm typecheck`；跨包边界变化跑 `rtk pnpm exec fallow audit --base main`；检索/摘要/治理相关改动补 `rtk pnpm eval:smoke`；文档变化补 `rtk pnpm check:docs` 与 `rtk pnpm check:structure`。
- **提交粒度：** 每个任务一个或多个独立 commit，commit message 遵循仓库风格（`refactor: ...` / `chore: ...` / `docs: ...`）。

## 工作流与依赖

```text
Wave 1 纯删除（并行）
  -> Wave 2 结构修复（按包并行）
  -> Wave 3 守卫落地（顺序）
  -> 全量验证 + closeout + debt register 回写
```

Wave 1 各任务文件域互不重叠，可最大并行；Wave 2 任务按包隔离；Wave 3 依赖前两波结果。

## 执行任务

### Task 1: backend-core 死代码删除

**Files:**
- Delete: packages/backend-core/src/use-cases/command-handling.ts, `use-cases/review-flows.ts`, `use-cases/retrieval-orchestration.ts`, `use-cases/job-scheduling.ts`, `use-cases/index.ts`（空目录删除）
- Delete: packages/backend-core/src/invocation/invocation-config.ts
- Delete: packages/backend-core/src/ports/telemetry-ports.ts, `ports/telemetry-ports.test.ts`
- Delete: packages/backend-core/src/runtime/status.ts, `runtime/topology.ts`, `runtime/route-surface.ts` 及其测试
- Delete: packages/backend-core/src/governance-review/application/conflict-scheduler.ts
- Modify: `packages/backend-core/src/testing/test-utils.ts`（收缩为仅 3 个有消费者的 stub：`createStubAuditLog`/`createStubMetrics`/`createStubRepositoryPorts`）
- Modify: `packages/backend-core/src/index.ts`（移除 `export * from './use-cases/index.js'` 与 `export * from './ports/telemetry-ports.js'` 相关行）
- Modify: `packages/backend-core/src/ports/index.ts`, `governance-review/application/index.ts`, `runtime/index.ts`, `invocation/index.ts`（删除死导出）
- Modify: `packages/backend-core/package.json`（移除 `"./modules"` 死导出路径——src 无 modules 目录；检查 `./use-cases` 导出）
- Modify: `packages/backend-core/src/runtime/capability-model.test.ts`（改用 stub，不再从 use-cases 导入）

**Interfaces:**
- Consumes: 六路审查报告的零消费者清单（use-cases 四文件仅 capability-model.test.ts 引用；telemetry-ports 仅自家测试引用；conflict-scheduler 仅 governance-review/application/index.ts re-export）。
- Produces: 删除后 `backend-core/src/index.ts` 导出面干净；`test-utils.ts` 只保留 3 个 stub。

- [ ] **Step 1: 删除死文件**
  删除上述文件（`git rm`），同步删除仅被死文件消费的测试与 index re-export。
- [ ] **Step 2: 清理导出面**
  更新 `index.ts`、`ports/index.ts`、`runtime/index.ts`、`invocation/index.ts`、`governance-review/application/index.ts`、`package.json` exports（移除 `./modules` 与 `./use-cases` 死路径）。
- [ ] **Step 3: 收缩 test-utils**
  保留 `createStubAuditLog`/`createStubMetrics`/`createStubRepositoryPorts`，删除其余 16 个 stub；`capability-model.test.ts` 改用保留 stub。
- [ ] **Step 4: 验证**
  运行 `rtk pnpm --filter @trapmap/backend-core test --run` 与 `rtk pnpm typecheck`；确认全绿。
- [ ] **Step 5: 全仓引用检查**
  `rg "use-cases|telemetry-ports|invocation-config|conflict-scheduler|runtime/status|runtime/topology|runtime/route-surface" packages --include-zero -g '*.ts'` 仅命中 dist 陈旧产物时通过。
- [ ] **Step 6: Commit**
  `refactor(backend-core): remove zero-consumer dead code and exports`

### Task 2: contracts 死代码删除

**Files:**
- Modify: `packages/contracts/src/domain/async.ts`（收缩到在用部分：`readModelProjectionSchema`、`candidateProcessingPayloadSchema`、`remediationReactivationPayloadSchema`、`badcaseExportDraftPayloadSchema`、`governanceConflictDetectionPayloadSchema`，约 60 行）
- Modify: `packages/contracts/src/domain/operations.ts`（删除 stats 组 1333-1450、badcase 组 1002-1107、async 快照组大部——仅保留 `AsyncWorkerDependencyState` 与 `OutboxStatusSnapshot` 各 2 处消费）
- Modify: `packages/contracts/src/domain/graph-query.ts`（删除 11 个死函数：`projectHardDependencyGraph`/`assertNoHardDependencyCycles`/`findEntriesByBoundaryConstraints`/`buildBoundaryFacetIndex`/`buildVersionNodeId`/`buildContextNodeId`/`buildPlatformNodeId`/`extractPlatformsFromExclusions`/`findEntriesByContext`/`normalizeContextLabel`/`normalizePackageName`）
- Delete: `packages/contracts/src/domain/async.test.ts` 中死契约相关用例（保留 5 个在用 payload 的用例）
- Modify: `packages/contracts/src/index.ts`（若删除的符号被聚合导出则同步移除）
- Modify: `packages/contracts/package.json`（删除 `graphology-dag` 依赖——其唯一消费者 `hasCycle` 随死函数删除；先确认其余 graphology 包仍有活消费）
- Delete: 20+ 零消费 RequestSchema（`knowledgeListRequestSchema`、`knowledgeDeactivateRequestSchema`、`activationRequestSchema`、`legacyMigrationRequestSchema`、`compatibilityStatusRequestSchema`、`skillEditRequestSchema`、`skillHistoryRequestSchema`、`skillReviewDecisionRequestSchema`、`auditQuerySchema`、`artifactExportRequestSchema` 等，以 grep 零消费者为准）
- Modify: `packages/contracts/src/domain/async.ts` 相关文档注释

**Interfaces:**
- Consumes: 六路审查的 contracts 死代码清单。
- Produces: `async.ts` ~800 行死代码移除；`graphology-dag` 依赖移除。

- [ ] **Step 1: 全仓 grep 确认**
  对每个待删符号执行 `rg "<symbol>" packages evals --include-zero -g '*.ts'`（排除 contracts 自身与 dist），确认零消费者。
- [ ] **Step 2: 删除 async.ts 死契约**
  删除 `asyncEventContracts`/`sharedJobContracts` 注册表、11 个 contract schema、全部死 payload；保留 5 个在用 payload。
- [ ] **Step 3: 删除 operations.ts 死段与死 RequestSchema**
  按 grep 结果删除；同步更新 index.ts 聚合。
- [ ] **Step 4: 删除 graph-query 死函数**
  删除 11 个死函数；删除 `graphology-dag` 依赖并 `pnpm install` 更新锁文件；确认 `graphology`/`graphology-operators`/`graphology-shortest-path` 仍有活调用（buildGraphRuntimeSnapshot/expandSourcesOneHop/buildLocalExpansionView/calculateSourceRelationStrength）。
- [ ] **Step 5: 验证**
  运行 `rtk pnpm --filter @trapmap/contracts test --run`、`rtk pnpm typecheck`、`rtk pnpm exec knip`（确认 unused exports 数量下降）。
- [ ] **Step 6: Commit**
  `refactor(contracts): remove zero-consumer schemas and graph dead code`

### Task 3: service-* 死文件与孤儿清理

**Files:**
- Modify: `packages/service-knowledge-read/src/graph-llm-extract.ts`（标记 `@eval-only`，头注释说明仅 eval 消费；从服务公共导出面移除）
- Modify: `packages/service-candidate-ingestion/src/llm-dedup.ts`（标记 `@eval-only`）
- Modify: `packages/service-governance-review/src/llm-conflict.ts`（标记 `@eval-only`）
- Delete: `packages/service-candidate-ingestion/src/schema.ts`（本地 7 表副本）→ 改为 re-export `@trapmap/persistence-schema`（并补该依赖声明）
- Delete: packages/service-identity-access/src/schema.ts, `service-knowledge-read/src/schema.ts`, `service-knowledge-write/src/schema.ts`, `service-governance-review/src/schema.ts`, `service-job-runtime/src/schema.ts`（孤儿 re-export，knip 报 unused）——若确认无引用
- Delete: 六个 `drizzle.config.ts`（孤儿，根无 drizzle 脚本，迁移走已提交 SQL）——若确认无引用
- Modify: `packages/service-candidate-ingestion/package.json`、`service-identity-access/package.json`、`service-governance-review/package.json`（补 `@trapmap/persistence-schema` 依赖声明——已 import 但未声明）
- Delete: 服务包 stale dist 产物（`wave9-*`、`knowledge-deps/*`、`snapshot-backfill*`、`identity-audit-backfill*`、`graph-projection-backfill*`、`activation-policy*` 等 37 个文件）——git 未跟踪，直接删除磁盘文件
- Modify: 各服务包 `index.ts`（移除 eval-only 模块导出）

**Interfaces:**
- Consumes: knip unused 清单 + 审查报告。
- Produces: 六包 schema.ts 单源（persistence-schema）；eval-only 模块带标记。

- [ ] **Step 1: 核实孤儿文件**
  `rg -rln "drizzle.config|from './schema" packages/service-*/src` 确认六包 schema.ts 与 drizzle.config.ts 无源码引用。
- [ ] **Step 2: 标记 eval-only 模块**
  三个文件加 `@eval-only` 头注释并从 index 导出移除；确认 evals 侧引用路径不变（动态 import 不依赖包导出面）。
- [ ] **Step 3: candidates schema 单源**
  `service-candidate-ingestion/src/schema.ts` 改为 `export * from '@trapmap/persistence-schema'`；补依赖声明；跑该包 pg-ports 测试确认行为不变。
- [ ] **Step 4: 删除孤儿 + stale dist**
  删除其余 5 个 schema.ts、6 个 drizzle.config.ts、37 个 stale dist 文件。
- [ ] **Step 5: 验证**
  运行六个 service 包测试、`rtk pnpm typecheck`、`rtk pnpm exec knip`。
- [ ] **Step 6: Commit**
  `refactor(service-*): mark eval-only modules, unify schema source, drop orphans`

### Task 4: hosts 死代码与死依赖删除

**Files:**
- Delete: packages/host-local/src/nest/runtime/validation.pipe.ts（knip unused file，路由校验已由 RouteDef schema 承担）
- Modify: `packages/host-distributed/package.json`（移除 `@sentry/node` 依赖——全 src 无 import）
- Modify: `packages/host-local/package.json`、`packages/host-distributed/package.json`（移除 `@trapmap/client-core` 依赖——两 host src 无 import）
- Modify: `packages/host-distributed/src/gateway/routes.ts`（移除 `'/v1/auth/register'` 死允许项——全仓无此路由）
- Modify: `packages/host-local/src/nest/runtime/backend-core-adapters.ts`（删除 `normalizeRoleTemplate` 与 `runtime/auth-context.ts:8-13` 的逐字重复，复用 auth-context 版本）
- 附带：`packages/host-local/src/nest/runtime/auth-context.ts` 保持原样（本主线不重构宿主业务）

**Interfaces:**
- Consumes: knip unused 清单。
- Produces: 两宿主依赖面与 src 一致；死允许项移除。

- [ ] **Step 1: 确认死依赖**
  `rg "from '@trapmap/client-core'|from '@sentry/node'" packages/host-local/src packages/host-distributed/src` 零命中后移除依赖并 `pnpm install`。
- [ ] **Step 2: 删除死文件与死允许项**
  删除 validation.pipe.ts；移除 register 允许项；`rg "register" packages/host-distributed/src/gateway/routes.ts` 确认无路由注册引用。
- [ ] **Step 3: 消重 normalizeRoleTemplate**
  删除 backend-core-adapters.ts 内重复实现，改 import auth-context 版本；跑 host-local 测试确认无回归。
- [ ] **Step 4: 验证**
  `rtk pnpm --filter @trapmap/host-local test --run`、`rtk pnpm --filter @trapmap/host-distributed test --run`、`rtk pnpm typecheck`、`rtk pnpm exec knip`。
- [ ] **Step 5: Commit**
  `refactor(hosts): drop unused deps and dead validation pipe`

### Task 5: web-panel 误提交产物清理

**Files:**
- Delete: packages/web-panel/vite.config.d.ts, `vite.config.d.ts.map`, `vitest.config.d.ts`, `vitest.config.d.ts.map`（git rm，tsc 构建产物误提交）
- Modify: 根 `.gitignore`（补充 `*.d.ts.map` 与 config 构建产物忽略规则，防复发）
- 附带：确认 `packages/web-panel/src/vite-env.d.ts`（类型声明，保留）与 `packages/host-local/src/types.d.ts`、`packages/contracts/src/types/mime-types.d.ts`（随 Task 8 parsing 下沉评估，本任务不动）

**Interfaces:**
- Consumes: `git ls-files` 确认 4 个误提交产物。
- Produces: git 跟踪面干净；构建产物防复发规则。

- [ ] **Step 1: 确认误提交产物**
  `git ls-files packages/web-panel | rg '\.d\.ts(\.map)?$'` 确认 4 个构建产物。
- [ ] **Step 2: 删除 + gitignore**
  `git rm` 4 个文件；根 `.gitignore` 补 `*.d.ts.map` 规则（`*.d.ts` 已有规则但被 `packages/*/src/**/*.d.ts` 精确匹配绕过，需补 `packages/*/*.d.ts` 层）。
- [ ] **Step 3: 验证**
  `git status` 干净、`rtk pnpm typecheck`、web-panel 构建不受影响。
- [ ] **Step 4: Commit**
  `chore(web-panel): remove committed build artifacts and ignore d.ts maps`

### Task 6: evals 双轨 runner 与孤儿目录清理

**Files:**
- Modify: `evals/scripts/eval-ci.ts`（复用 `eval-all.ts` 导出的 `runRetrievalEval`/`runSummaryEval`，删除 `eval-ci.ts:375-455` 的重复实现；统一 report 类型）
- Modify: `evals/scripts/eval-all.ts`（导出 `runRetrievalEval`/`runSummaryEval`；统一 `reports/eval-report.json` 输出 schema——CI 与 all 共用一份）
- Delete: evals/baselines/（孤儿目录，真实基线在 `reports/baselines`，由 `eval-ci.ts:77` 的 `BASELINES_DIR` 管理）
- Modify: `knip.json`（entry 补全所有 eval 可执行入口：`evals/retrieval/run.ts`、`summary/run.ts`、`agent-planning/run.ts`、`label-alignment/run.ts`、`graph-extraction/run.ts`、`ingestion/run.ts`、`retrieval-live/run.ts`、`retrieval-live/compare.ts`、`graph-extraction/dedup-eval.ts`、`conflict-eval.ts`、`evals/scripts/annotate-skills.ts`）
- 附带：`scripts/run-eval.ts:222-234` 的 `--smoke` 特判保留（历史兼容入口，本主线不改分发语义）

**Interfaces:**
- Consumes: 审查报告的 eval-ci/eval-all 双轨证据。
- Produces: 单一 runner 实现；knip 可报告 eval 死代码。

- [ ] **Step 1: 合并 eval-ci 与 eval-all**
  `eval-ci.ts` 改 import `eval-all.ts` 的 runner 函数；删除重复的 `runRetrievalEval`/`runSummaryEval`/`CIReport`；统一 report 写盘路径与 schema。
- [ ] **Step 2: 删除孤儿目录**
  `git rm -r evals/baselines`（先确认无引用：`rg "evals/baselines" . -g '*.ts' -g '*.md'`）。
- [ ] **Step 3: knip entry 补全**
  更新 `knip.json` entry 列表；运行 `rtk pnpm exec knip` 验证新 entry 生效（eval 死代码可报告）。
- [ ] **Step 4: 验证**
  `rtk pnpm eval -- retrieval --tier smoke --dry-run`、`rtk pnpm eval -- summary --tier smoke --dry-run`（dry-run 不依赖 PG/密钥）。
- [ ] **Step 5: Commit**
  `refactor(evals): merge ci runner into eval-all and fix knip entries`

### Task 7: candidates 表双份合并

**Files:**
- Delete: `packages/service-candidate-ingestion/src/schema.ts` 本地 7 表定义（改为 `export * from '@trapmap/persistence-schema'`）——若 Task 3 已执行则验证
- Modify: `packages/persistence-schema/src/candidates.ts`（核对与本地副本的列差异：auditTimestamps 工厂、CHECK 集合、列顺序，以本地版为准补齐后以 persistence-schema 为唯一源）
- Modify: `packages/service-candidate-ingestion/package.json`（补 `@trapmap/persistence-schema` 依赖）
- Modify: `packages/service-candidate-ingestion/src/migrations.ts`（确认迁移 SQL 与 persistence-schema 表名一致）
- Test: `packages/service-candidate-ingestion/src/pg-ports.test.ts`、`migrations.test.ts`

**Interfaces:**
- Consumes: 审查报告的表双份 diff 证据。
- Produces: 单源表定义；包依赖声明完整。

- [ ] **Step 1: diff 两份定义**
  `diff` 本地 schema.ts 与 persistence-schema/candidates.ts 的 7 表列定义，列出漂移点。
- [ ] **Step 2: 统一到 persistence-schema**
  以本地版（有实际迁移验证）为准补齐 persistence-schema 差异；本地 schema.ts 改 re-export；补依赖声明。
- [ ] **Step 3: 验证**
  `rtk pnpm --filter @trapmap/service-candidate-ingestion test --run`、`rtk pnpm typecheck`、`rtk pnpm exec fallow audit --base main`。
- [ ] **Step 4: Commit**
  `refactor(candidate-ingestion): single-source candidate tables from persistence-schema`

### Task 8: contracts 逻辑下沉（图算法 + parsing）

**Files:**
- Create: packages/service-knowledge-read/src/graph-query-core.ts（从 contracts graph-query.ts 迁移 4 个活函数：`buildGraphRuntimeSnapshot`/`expandSourcesOneHop`/`buildLocalExpansionView`/`calculateSourceRelationStrength` 及 Graph 实现）
- Modify: `packages/contracts/src/domain/graph-query.ts`（只保留 schema/类型：`GraphQueryBackend` 接口、`GraphIndexDocumentRecord`、`GraphQueryNodeView` 等类型与 `backendKind` 枚举）
- Create: packages/lib/src/parsing.ts（从 contracts parsing.ts 迁移 `parseMarkdownFrontmatter`/`parseSkillMarkdown`/`detectMediaType`/`isTextLikeMediaType` + MIME 覆写表）
- Delete: `packages/contracts/src/domain/parsing.ts`, `contracts/src/types/mime-types.d.ts`（随 parsing 迁移）
- Modify: `packages/contracts/package.json`（移除 `gray-matter`、`mime-types` 依赖）
- Modify: `packages/lib/package.json`（补 `gray-matter`、`mime-types` 依赖）
- Modify: 消费方（`service-knowledge-read/src/graph-query.ts:10-15`、CLI `artifact-bundle.ts`、`service-knowledge-write` parse-content.ts）改 import 新位置
- Test: lib parsing 单测 + service-knowledge-read graph-query 测试 + 受影响包测试

**Interfaces:**
- Consumes: graph-query.ts/parsing.ts 的活消费方清单。
- Produces: contracts 回到纯 schema；图算法在 service-knowledge-read，parsing 在 lib。

- [ ] **Step 1: 迁移 parsing 到 lib**
  `git mv` 逻辑；lib 补依赖与单测；消费方改 import；contracts 删除 parsing.ts 与 mime-types.d.ts。
- [ ] **Step 2: 迁移图算法到 service-knowledge-read**
  复制 4 个活函数与 Graph 实现到 `graph-query-core.ts`；contracts 保留纯类型；service-knowledge-read 消费方改 import；删除 contracts 中 graphology 实现代码。
- [ ] **Step 3: contracts 依赖清理**
  移除 `gray-matter`/`mime-types`；评估 graphology 依赖是否仍需（若 4 个活函数已迁走，则 contracts 全部 graphology 依赖可移除）；`pnpm install` 更新锁文件。
- [ ] **Step 4: 验证**
  `rtk pnpm --filter @trapmap/lib test --run`、`rtk pnpm --filter @trapmap/service-knowledge-read test --run`、`rtk pnpm --filter @trapmap/cli test --run`、`rtk pnpm typecheck`、`rtk pnpm eval:smoke`、`rtk pnpm exec fallow audit --base main`。
- [ ] **Step 5: Commit**
  `refactor(contracts): move graph algorithms and parsing out of contracts`

### Task 9: 循环依赖解除（store.ts 类型下沉）

**Files:**
- Create: packages/contracts/src/domain/knowledge-records.ts（从 `service-knowledge-read/src/store.ts:133-161` 与 `service-governance-review/src/review-queue-projection.ts:90-115` 合并共享 record 类型：`KnowledgeRecord`/`KnowledgeRevisionRecord`/`SubmissionRecord`/`LifecycleEventRecord` 等）
- Modify: `packages/service-knowledge-read/src/store.ts`（record 类型改 import contracts，本地删除重复定义）
- Modify: `packages/service-governance-review/src/review-queue-projection.ts`（同上）
- Modify: `packages/service-knowledge-write/src/artifact-derive/types.ts`、`contextual-enrichment.ts`、`artifact-derive-from-payloads.ts`、`knowledge-record-mutations.ts`（4 处 `import ... from '@trapmap/service-knowledge-read/store.js'` 改为 contracts）
- Modify: `packages/service-knowledge-read/package.json`（移除 devDependencies 中的 `@trapmap/service-knowledge-write` 反向声明）
- Test: 三包受影响测试 + `rtk pnpm typecheck`

**Interfaces:**
- Consumes: 审查报告的 write→read import 4 处清单。
- Produces: 无 write→read 依赖；共享 record 类型在 contracts 单源。

- [ ] **Step 1: 汇总共享 record 类型**
  从 store.ts 与 review-queue-projection.ts 提取公共 record 类型到 contracts；核对字段差异后统一。
- [ ] **Step 2: 三包改 import**
  write 包 4 处与 read store.ts、governance review-queue-projection.ts 改从 contracts 导入。
- [ ] **Step 3: 移除反向 devDep**
  read 包 package.json 移除 write 声明；`rg "@trapmap/service-knowledge-read" packages/service-knowledge-write` 确认零 import。
- [ ] **Step 4: 验证**
  三包测试、`rtk pnpm typecheck`、`rtk pnpm exec fallow audit --base main`、`rtk pnpm exec fallow list --boundaries`。
- [ ] **Step 5: Commit**
  `refactor(services): move shared knowledge records to contracts, break read-write cycle`

### Task 10: SQL 落位修正（domain 纯净）

**Files:**
- Modify: `packages/backend-core/src/job-runtime/domain/policy.ts`（删除 12+ SQL 方言字符串常量：`TASK_CLAIMABLE_SQL_CONDITION` 等，只保留状态枚举与 claim 策略名）
- Modify: `packages/service-job-runtime/src/async-runtime.ts`（SQL 常量移入此文件并 update import）
- Test: `packages/service-job-runtime/src/async-runtime.test.ts`、`packages/backend-core/src/job-runtime/domain/policy.test.ts`

**Interfaces:**
- Consumes: 审查报告的 policy.ts:79 SQL 清单。
- Produces: backend-core domain 零 SQL；job-runtime 持有 SQL。

- [ ] **Step 1: 核对 SQL 消费者**
  `rg "TASK_CLAIMABLE_SQL_CONDITION|SQL_CONDITION" packages` 确认消费者。
- [ ] **Step 2: 移动 SQL 常量**
  从 backend-core domain 移到 service-job-runtime；domain 只留纯策略。
- [ ] **Step 3: 验证**
  两包测试、`rtk pnpm typecheck`、`rtk pnpm exec fallow audit --base main`。
- [ ] **Step 4: Commit**
  `refactor(job-runtime): move SQL constants out of domain`

### Task 11: DATABASE_SCHEMA 文档校准

**Files:**
- Modify: `docs/reference/DATABASE_SCHEMA.md`（62→64 表；补 `knowledge_submissions`、`knowledge_review_decisions`；裁决 `conflict_relations` 幽灵表：若仅存在于 service-governance-review/drizzle/0000_shiny_swarm.sql 则从文档移除或迁入 persistence-schema——以实际迁移为准）
- Modify: `packages/persistence-schema/src/queue.ts`（确认 `task_queue_type_dedupe_idx` 非部分索引冗余，若覆盖同一列组则删除；以测试与迁移为准）
- 附带：`docs/README.md:264` LLM 图提取条目（已在 Task 3 标记 @eval-only 后，把归档条目标注为"仅 eval 链路引用"）

**Interfaces:**
- Consumes: persistence-schema 64 表实测 + DATABASE_SCHEMA.md 62 表 + migration SQL 对比。
- Produces: 文档与代码表清单一致；防复发守卫在 Task 12 落地。

- [ ] **Step 1: 生成表清单 diff**
  提取 persistence-schema 全部 pgTable 表名 vs DATABASE_SCHEMA.md 表清单，列出差异。
- [ ] **Step 2: 更新文档**
  DATABASE_SCHEMA.md 更新为 64 表 + 补缺表 + 裁决 conflict_relations。
- [ ] **Step 3: 索引冗余确认**
  按 queue.ts 注释与迁移 SQL 确认 task_queue_type_dedupe_idx 冗余后删除（含迁移 SQL 中的对应索引，谨慎：先确认无查询依赖）。
- [ ] **Step 4: 验证**
  `rtk pnpm check:docs`、`rtk pnpm check:structure`、受影响包测试。
- [ ] **Step 5: Commit**
  `docs: align DATABASE_SCHEMA with persistence-schema (64 tables)`

### Task 12: 防复发守卫落地

**Files:**
- Create: scripts/check-table-schema.ts（从 persistence-schema 提取表清单，对比 DATABASE_SCHEMA.md 声明，diff 即失败）
- Modify: `scripts/check-doc-truth.ts` 或新建 guard（pgTable 双份守卫：扫描 `packages/service-*/src/**/schema.ts`，禁止直接定义 pgTable，只允许 re-export persistence-schema）
- Modify: `scripts/check-relative-imports.mjs`（把 `evals/` 纳入检查范围，或新建 scripts/check-eval-imports.mjs：只允许白名单路径——`host-local` 的公开测试装配面与 contracts——禁止 evals 直连 service 内部文件；@eval-only 模块除外）
- Create: scripts/check-eval-only.ts（扫描 product 包 src，检测仅被 evals 引用的模块是否带 `@eval-only` 头注释；未标记即失败）
- Modify: `package.json`（注册新 guard scripts，接入 `pnpm check` 与 CI `run-ci.ts`）
- Modify: `knip.json`（Task 6 已补 entry，此处确认 eval 死代码可报告）
- Modify: `docs/operations/TESTING.md`、`docs/operations/CI_CD.md`、`docs/guides/DOCUMENTATION_GOVERNANCE.md`（新增 guard 说明）

**Interfaces:**
- Consumes: Task 2/3/7/11 的清理结果（表单源、eval-only 标记、表清单校准）。
- Produces: 四类防复发守卫接入 CI。

- [ ] **Step 1: 表清单守卫**
  实现 `check-table-schema.ts`；正例（一致）绿、反例（缺表/幽灵表）红；接 package.json 与 run-ci.ts。
- [ ] **Step 2: pgTable 双份守卫**
  实现 service schema 单源扫描；candidate-ingestion 本地定义（Task 3 已改 re-export 后）作为反例基线。
- [ ] **Step 3: eval import 边界守卫**
  `check-relative-imports.mjs` 纳入 evals 或新建守卫；白名单 evals→host-local testing 装配面与 contracts；其余 evals→service 内部 import 失败；@eval-only 模块例外。
- [ ] **Step 4: @eval-only 标记守卫**
  实现扫描；3 个已标记模块为反例基线；新 eval-only 依赖必须带标记。
- [ ] **Step 5: 验证 + 文档**
  `rtk pnpm check:docs`、`rtk pnpm check:structure`、`rtk pnpm exec fallow audit --base main`、新增 guard 单测；更新 TESTING.md/CI_CD.md/DOCUMENTATION_GOVERNANCE.md。
- [ ] **Step 6: Commit**
  `feat(guards): enforce table single-source, eval import boundaries, and eval-only markers`

### Task 13: 回归验证与 closeout

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`（回写：确认删除的死代码项关闭；未实施的大重构项——capability-model 拆分、OTel/Consul 双份收敛、EvalSeedPort 收窄、web-panel real 路径、internal-client review/governanceReview 合并、shared/ports.ts 业务下沉——登记为长期 debt 带进入条件）
- Modify: `docs/README.md`（LLM 图提取条目标注状态；若主线完成则更新"当前整改主线"小节）
- 全量验证：`rtk pnpm typecheck`、受影响包全量测试、`rtk pnpm exec knip`、`rtk pnpm exec fallow audit --base main`、`rtk pnpm check:docs`、`rtk pnpm check:structure`、`rtk pnpm eval:smoke`（若 docker 可用；不可用则记录 CI 需补跑）

**Interfaces:**
- Consumes: Task 1-12 全部结果。
- Produces: closeout 证据 + debt register 回写 + 新维护基线。

- [ ] **Step 1: 全量回归**
  运行上述全部命令，记录 knip/fallow 新基线数字。
- [ ] **Step 2: debt register 回写**
  关闭已确认删除项；登记未实施大重构项（带来源/影响/进入条件/后续落点）。
- [ ] **Step 3: 文档回写**
  更新 docs/README.md 与相关 reference；`rtk pnpm check:docs` 通过。
- [ ] **Step 4: 归档**
  全任务证据齐全后，本细则归档至 `docs/archived/archived-plans/`，根 `plan.md` 切换。
- [ ] **Step 5: Commit**
  `docs: closeout dead code and architecture order cleanup`

## Completion Gates

- [ ] 全仓确认死代码/死路径已删除（约 3000+ 行），knip unused files/exports 显著下降。
- [ ] `contracts` 无图算法/parsing/worker 运行时逻辑，依赖面仅剩 zod（及必要的 graphology 若保留消费）。
- [ ] candidates 表单源在 persistence-schema，六包 schema.ts 只 re-export。
- [ ] 无 `service-*` 之间的实现级 import（write↔read 环已断）。
- [ ] backend-core domain 零 SQL 字符串。
- [ ] DATABASE_SCHEMA.md 与 persistence-schema 表清单一致（64 表）。
- [ ] 四类防复发守卫（表清单、pgTable 双份、eval import 边界、@eval-only 标记）接入 CI 且可阻断。
- [ ] eval-only 模块带标记且不在产品公共导出面。
- [ ] 全量 typecheck + 受影响包测试全绿；fallow audit 无 changed-file issue；eval:smoke 在 CI 补跑记录。
- [ ] debt register 已回写：死代码项关闭，大重构项带进入条件登记。
- [ ] 本细则归档，根 plan.md 切换到下一主线或置空。
