# System Truth Sources

Each architecture fact has one authoritative source. When secondary docs drift, the authoritative source wins.

| Topic | Authoritative Source | Secondary Docs |
|---|---|---|
| Server entry point | `packages/server/src/app.ts` (`buildServer()`), `packages/server/src/index.ts`, `packages/server/src/worker.ts` | `docs/guides/CODE_GUIDE.md`, `docs/architecture/ARCHITECTURE.md` |
| Startup sequence | `packages/server/src/bootstrap/run-startup-sequence.ts` + `packages/server/src/bootstrap/run-worker-sequence.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/guides/CODE_GUIDE.md` |
| Server layer ownership (`domain` / `application` / `infrastructure` / `interfaces/http` / `interfaces/worker`) | `docs/plans/backend-engineering-masterplan/01-boundaries-and-compat-convergence.md` + `packages/server/README.md` + `packages/server/src/lib/README.md` + `packages/server/src/routes/README.md` | `docs/plans/backend-engineering-roadmap/stage-1-foundation-and-boundaries.md`, `docs/architecture/ARCHITECTURE.md`, `docs/PACKAGES.md` |
| Persistence migration state | `docs/reference/DATA_MODEL.md` | `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` |
| DB schema | `packages/server/src/lib/persistence/schema/index.ts` (barrel, re-exports all domain table modules) | `docs/reference/DATABASE_SCHEMA.md` |
| Server data-access boundary | `packages/server/src/lib/actors/lookup.ts` (actor lookup), `packages/server/src/lib/repos/index.ts` (`SkillShareerRepos`) | `docs/PACKAGES.md`, `docs/reference/DATA_MODEL.md` |
| Server bounded contexts and layer ownership | `docs/plans/backend-engineering-masterplan/01-boundaries-and-compat-convergence.md` + `docs/architecture/ARCHITECTURE.md` | `plan.md`, `docs/PACKAGES.md`, `docs/plans/backend-engineering-roadmap/stage-1-foundation-and-boundaries.md` |
| Six-service ownership boundary (`identity-access` / `candidate-ingestion` / `knowledge-write` / `review` / `knowledge-read` / `job-runtime`) | `packages/backend-core/src/ports/internal-ports.ts` + `packages/backend-core/src/modules/*.ts` + `packages/host-distributed/src/config/service-config.ts` + `packages/service-*/src/index.ts` | `docs/architecture/ARCHITECTURE.md`, `packages/backend-core/README.md`, `packages/host-distributed/README.md` |
| `backend-core` / `host-*` ownership relationship | `docs/plans/backend-engineering-masterplan/01-boundaries-and-compat-convergence.md` + `packages/backend-core/src/use-cases/command-handling.ts` + `packages/host-local/src/http/gateway.ts` + `packages/host-distributed/src/shared/ports.ts` | `docs/architecture/ARCHITECTURE.md`, `docs/plans/runtime-recomposition/`, `docs/plans/deployment-flexibility/` |
| Nest service evolution Phase 0 target architecture freeze | `plan.md` + `docs/todos/nestjs-service-evolution-00-target-architecture.md` + `packages/backend-core/src/runtime/capability-model.ts` + `packages/backend-core/src/ports/internal-ports.ts` + `packages/contracts/src/domain/async.ts` | `README.md`, `architecture.md`, `docs/README.md`, `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md` |
| Nest service evolution Phase 1 host and contract foundation freeze | `plan.md` + `docs/todos/nestjs-service-evolution-01-host-and-contract-foundation.md` + `packages/backend-core/src/invocation/invocation-model.ts` + `packages/service-knowledge-read/src/routes.ts` + `packages/service-knowledge-read/src/deps.ts` + `packages/host-distributed/src/gateway/internal-client.ts` + `packages/host-distributed/src/shared/internal-knowledge-write-client.ts` + `docs/PACKAGE_STACK_RATIONALE.md` | `README.md`, `docs/README.md`, `docs/PACKAGES.md`, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/DEPLOYMENT.md`, `docs/reference/api-surface.md` |
| Distributed maturity baseline (`Level 2 / transitional-microservice`) | `docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md` + `packages/host-distributed/src/gateway/distributed-acceptance.test.ts` + `packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts` + `packages/host-distributed/src/shared/database.ts` | `plan.md`, `README.md`, `docs/README.md`, `docs/PACKAGES.md`, `docs/architecture/DEPLOYMENT.md` |
| Persistence posture | `README.md` + `packages/server/src/lib/persistence/schema/*.ts` | `docs/README.md`, `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| CI jobs | `.github/workflows/ci.yml` | `docs/operations/CI_CD.md`, `docs/operations/TESTING.md` |
| Schema count | `packages/server/src/lib/persistence/schema/*.ts` (artifacts.ts, knowledge.ts, candidates.ts, auth.ts, retrieval.ts, queue.ts, index.ts) | `docs/reference/DATABASE_SCHEMA.md`, `docs/README.md` |
| Guardrail commands | `scripts/complexity-budgets.json` + `.github/workflows/ci.yml` | `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` |
| Startup commands | `package.json` scripts section | `docs/README.md`, `docs/guides/GETTING_STARTED.md`, `docs/guides/MIGRATION_GUIDE.md` |
| Eval entrypoints | `package.json` scripts section | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` |
| Deployment defaults | `docker-compose.yml` + `packages/server/Dockerfile` | `docs/architecture/DEPLOYMENT.md`, `docs/README.md` |
| Deployment profile glossary and compatibility boundary | `plan.md` + `packages/backend-core/src/runtime/capability-model.ts` + `packages/server/src/config.ts` + `packages/server/src/lib/runtime/deployment-profile.ts` + `packages/server/src/lib/runtime/deployment-preset.ts` | `architecture.md`, `docs/PACKAGES.md`, `docs/architecture/DEPLOYMENT.md`, `docs/plans/README.md`, `docs/guides/MIGRATION_GUIDE.md` |
| Host-local runtime defaults | `packages/host-local/src/config/host-config.ts` + `packages/host-local/src/bootstrap/server.ts` | `README.md`, `docs/guides/MIGRATION_GUIDE.md`, `packages/host-local/README.md` |
| Host-distributed service defaults | `packages/host-distributed/src/config/service-config.ts` | `docs/guides/MIGRATION_GUIDE.md`, `packages/host-distributed/README.md` |
| Root workspace commands | `package.json` (scripts section) | `README.md`, `docs/README.md`, `docs/operations/TESTING.md` |
| Server-only DB commands | `packages/server/package.json` (db:generate, db:migrate, db:push) | `docs/guides/GETTING_STARTED.md`, `docs/architecture/DEPLOYMENT.md` |
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
| Runtime request/trace headers | `packages/server/src/config.ts` + `packages/server/src/lib/runtime/request-context.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/DEPLOYMENT.md`, `docs/reference/api-surface.md` |
| Runtime status/readiness contract | `packages/server/src/app.ts` + `packages/server/src/lib/runtime/runtime-metadata.ts` | `docs/architecture/DEPLOYMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/reference/api-surface.md`, `docs/operations/TESTING.md` |
| Async operator status contract (`runtimeContract` / `freshnessContract` / `idempotencyContract` / `retryResumeContract` / `failureTaxonomy`) | `packages/contracts/src/domain/operations.ts` + `packages/server/src/routes/operations/status.ts` | `docs/architecture/components/ASYNC_MODEL.md`, `docs/operations/ENVIRONMENT.md`, `docs/operations/TESTING.md`, `plan.md` |
| Phase 3 operator/config/capacity truth surface (`operatorHome` / `configGovernance` / `capacityModel` / `bulkOperations`) | `packages/contracts/src/domain/operations.ts` + `packages/server/src/routes/operations/status.ts` + `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/reference/api-surface.md`, `docs/reference/PERFORMANCE.md`, `docs/architecture/ARCHITECTURE.md`, `plan.md` |
| Stats summary cache invalidation / pending invalidation capacity view | `packages/contracts/src/domain/operations.ts` + `packages/server/src/routes/operations/stats.ts` | `docs/reference/PERFORMANCE.md`, `docs/operations/TESTING.md`, `docs/reference/api-surface.md` |
| Root execution-plan governance and closeout rules | `plan.md` + `docs/guides/DOCUMENTATION_GOVERNANCE.md` + `docs/reference/REPO_STRUCTURE.md` | `docs/plans/README.md`, `docs/todos/README.md`, `docs/README.md` |
| Phase 3 open-question closeout (`databasePool.maxConnections` deferred detail, hot team/query/artifact non-default drill-down) | `docs/plans/backend-engineering-masterplan/03-operator-config-capacity-and-cache-ops.md` + `packages/contracts/src/domain/operations.ts` + `packages/server/src/routes/operations/status-phase3.ts` | `docs/reference/PERFORMANCE.md`, `docs/reference/api-surface.md`, `docs/architecture/ARCHITECTURE.md` |
| Async event and shared job idempotency / retry catalog | `packages/contracts/src/domain/async.ts` | `docs/architecture/components/ASYNC_SHARED_JOB_CONTRACTS.md`, `docs/architecture/components/ASYNC_MODEL.md`, `docs/todos/backend-engineering-optimization-plan.md` |
| Shared resilience policy | `packages/server/src/lib/runtime/resilience.ts` | `docs/operations/ENVIRONMENT.md`, `docs/operations/TESTING.md`, `docs/architecture/ARCHITECTURE.md` |
| Runtime metrics snapshot semantics | `packages/server/src/lib/runtime/metrics.ts` | `docs/operations/ENVIRONMENT.md`, `docs/operations/TESTING.md` |
| Retrieval cache invalidation policy | `packages/server/src/lib/cache/invalidation.ts` + `packages/server/src/lib/cache/retrieval-read-model-cache.ts` + `packages/server/src/lib/retrieval/capsules/intent-cache.ts` | `docs/PACKAGES.md`, `docs/PACKAGE_STACK_RATIONALE.md`, `docs/operations/TESTING.md` |
| Queue / outbox reliability policy | `packages/server/src/lib/queue/task-queue.ts` + `packages/server/src/lib/lifecycle/outbox.ts` + `packages/server/src/bootstrap/bootstrap-lifecycle.ts` | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md`, `docs/architecture/DEPLOYMENT.md` |
| AI provider/model defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/GETTING_STARTED.md` |
| Eval workflow | `.github/workflows/eval.yml` | `docs/operations/TESTING.md`, `docs/operations/CI_CD.md` |
| Deep architecture persistence docs | `packages/server/src/lib/persistence/schema/*.ts` | `docs/architecture/components/PERSISTENCE.md`, `docs/reference/DATABASE_SCHEMA.md` |
| Health/readiness endpoints | `packages/server/src/app.ts` (`/health`, `/ready`, `/meta/routes`) | `docs/architecture/DEPLOYMENT.md`, `docs/guides/GETTING_STARTED.md` |
| Deep architecture component docs | `packages/server/src/lib/persistence/schema/*.ts` + component source | `docs/architecture/components/*.md` |
| Operator-only internal APIs | `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/components/RETRIEVAL.md` |
| Repository layout | `docs/reference/REPO_STRUCTURE.md` | `README.md`, `docs/README.md`, `docs/guides/CODE_GUIDE.md` |

> For the full cross-cutting documentation truth matrix (covering CI, deployment, testing, guardrails, and schema ownership), see [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md).

## Rules

1. **Authoritative source wins.** When secondary docs conflict with the authoritative source, update the secondary doc.
2. **`store_snapshot` is a compatibility layer.** It is no longer the PG primary read path for identity/audit domains (Round 10 Phase 3 completed migration), but it is still used as a compatibility layer for unmigrated domains and on certain startup paths (e.g. candidate recovery). See `docs/reference/DATA_MODEL.md`.
3. **Route/business logic reads current aggregate state from `repos`, not from snapshot compatibility data.** The canonical data-access boundary for server business logic is `app.skillShareer.repos`. Actor lookup (user handles, membership levels) uses `packages/server/src/lib/actors/lookup.ts` backed by `repos.user` and `repos.membership`. Core business routes (auth, knowledge, traps, retrieval) must use `repos.*` for reads and writes.
4. **Routes are transport adapters, not workflow orchestrators.** Route handlers may validate input, authorize, resolve actor/target context, delegate to application services, and serialize responses. Multi-step persistence, lifecycle coordination, and compatibility-store debt belong in application services or repositories.
5. **Runtime/bootstrap ownership stays in infrastructure.** Startup sequencing, migration execution, worker supervision, readiness/health calculation, recovery, and other process-level concerns belong in `bootstrap/`, `lib/runtime/`, `lib/queue/`, or adjacent infrastructure modules, not in domain/application services.
6. **Read-model assembly stays on the read side unless explicitly documented otherwise.** Write-side application services should not quietly assemble retrieval, review-queue, or runtime projections. If a write flow must return a derived read model, that coupling must be named in docs and remain local to the documented boundary.
7. **`store.snapshot()` / `store.transact()` usage is restricted to an explicit allowlist.** The guard test at `packages/server/src/__tests__/snapshot-usage-guard.test.ts` enforces this. Phase 1 freezes the allowed categories to:
   - **Repository implementations** (`lib/*/repository.ts`): wrap store as compatibility layer by design
   - **Migration/backfill scripts** (`lib/persistence/migrate-*.ts`, `backfill-*.ts`): one-off data migration
   - **Bootstrap files** (`bootstrap/*.ts`): startup wiring and recovery
   - **Lifecycle subscribers** (`lib/lifecycle/subscribers/*.ts`): event-driven side effects
   - **Candidate processing** (`lib/candidates/processor.ts`, `lib/candidates/services/*.ts`): pipeline mutations
   - **Diagnostic/admin mutations** (`routes/operations/artifacts-export.ts`, `routes/operations/artifacts-import.ts`, `routes/operations/migrate.ts`, `routes/feedback-admin.ts`, `routes/admin-*.ts`, `routes/maintenance.ts`, etc.): controlled operator writes or migration flows that still append audit/history through `store.transact()`. This category is not a blanket approval for read-side snapshot assembly.
   - **Projection exceptions** (`lib/operations/read-model.ts`): explicit read-side helpers with named repo capability gaps. `lib/operations/read-model.ts` is the Stage 1 operator projection seam; its remaining `store.snapshot()` is limited to artifact revision payload hydration for export because no repository method exposes revision file bodies.
  - **Application-service compatibility seam** (`lib/knowledge/review-application-service.ts`): historical migration debt only. Active server routes no longer use this file for authoritative review writes; current write ownership lives behind distributed host services.
   - **Remaining migration targets**: none for retrieval read-model assembly; it now reads through repository seams instead of compatibility snapshot input.
8. **`packages/server` is now a compatibility shell for candidate/review/maintenance/decay writes.** `packages/backend-core` defines command/use-case/port contracts and `packages/host-local` / `packages/host-distributed` provide host assembly and concrete port wiring; authoritative write orchestration for candidate resolution, review decisions, maintenance batch, and decay batch belongs to distributed host services rather than server routes.
9. Stage 1 read-side收口现状：`routes/review.ts` 的 review-queue 投影与 `routes/decay.ts` 的 entries/search 投影都已委托给 `lib/operations/read-model.ts` 中的显式 projection helper，route 自身只保留 transport / auth / response 映射。`routes/operations/status.ts` 和 `routes/operations/audit.ts` 也不再直接读取 compatibility snapshot；operator read-side snapshot access 当前仅局部保留在 `lib/operations/read-model.ts` 的命名 projection exception（artifact revision payload hydration）。Phase 1 遗留 open question 已在 Phase 2 核查关闭，目前不存在其他 operator 读侧 repo capability gap / projection exception。
10. Phase 2 async contract 收口现状：`/v1/operations/status/async` 必须使用统一 schema 暴露 runtime mode semantics、freshness / projection lag、idempotency、retry / resume / reclaim 和 failure taxonomy；不要在 secondary docs 或 route-local helper 中再发明第二套术语。
11. 根计划 closeout 规则：根 `plan.md` 只有在“代码/contract + 聚焦测试 + facts/truth-source 回写 + `check:docs-drift` + `check:structure`”全部完成后才能勾选阶段复选框。
12. 根 `plan.md` 是当前执行索引；`docs/todos/` 中被根计划链接的文件可以承担当前细则执行角色。`docs/plans/` 默认保存 historical-reference 或长期参考，除非根计划显式重新激活某个目录。
13. All pull requests that touch architecture or persistence docs must verify consistency against this table.
14. Six-service boundary freeze: `knowledge-write` owns all knowledge/trap/evidence write truth, including applying review/maintenance/decay decisions and publishing candidate results; `review` owns governance queue/decision/feedback/maintenance/decay commands but must delegate final aggregate mutation through remote `KnowledgeWritePort` invocation with no local knowledge-repo fallback; `candidate-ingestion` owns candidate workflow facts but must publish resolved results through remote `KnowledgeWritePort` and may only mark candidates resolved after that publish succeeds; `knowledge-read` only consumes read projections or events; `job-runtime` only owns queue/outbox/runtime transport and worker scheduling glue.
15. Compatibility-shell closeout fact: `review` owns governance queue/decision/feedback/maintenance/decay commands but must delegate final aggregate mutation through `KnowledgeWritePort`; `candidate-ingestion` owns candidate workflow facts but must publish resolved results through `KnowledgeWritePort`; `packages/server` keeps legacy route compatibility but candidate apply-resolution, knowledge review, maintenance batch, and decay batch now return `501 capability_unsupported` instead of acting as authoritative write orchestration.

## CI Guards

Two automated guards enforce these rules on every PR. They run as the `architecture-guardrails` job in CI and can be run locally. For the full cross-cutting documentation truth matrix, see [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md).

### Doc Drift Guard

```bash
pnpm check:docs-drift
```

Checks that key documentation files contain required phrases and do not contain stale or banned phrases. Rules are defined in `scripts/complexity-budgets.json` under `docRules`.

Current rules:
- `docs/guides/CODE_GUIDE.md` must contain `buildServer()` and must NOT contain `createApp()`
- `docs/architecture/ARCHITECTURE.md` must contain a reference to `SYSTEM_TRUTH_SOURCES.md`

**To add a new rule:** edit `scripts/complexity-budgets.json` and add an entry to `docRules` with `file`, optional `mustContain`, and optional `mustNotContain` arrays.

### Complexity Budget Guard

```bash
pnpm check:complexity
```

Checks that tracked hotspot files do not exceed their configured line budgets. Rules are defined in `scripts/complexity-budgets.json` under `lineBudgets`.

Current budgets:
| File | Budget | Current |
|---|---|---|
| `packages/server/src/app.ts` | 350 lines | ~307 |
| `packages/server/src/routes/candidates.ts` | 150 lines | ~15 |
| `packages/server/src/lib/persistence/schema.ts` | 200 lines | ~16 |
| `packages/server/src/lib/artifacts/pg-repository.ts` | 250 lines | ~17 |

**To adjust a budget:** edit `scripts/complexity-budgets.json` and update the `maxLines` value for the relevant file. Budgets should be set at a level that triggers a warning before a file becomes unmanageable, not at the current size.

**To add a new tracked file:** add an entry to `lineBudgets` with `file` and `maxLines`.

## Maintenance

When updating truth docs and guardrails together:

1. Update the authoritative source first
2. Update secondary docs listed in [`DOCS_TRUTH_MATRIX.md`](DOCS_TRUTH_MATRIX.md)
3. Add or update a doc-drift rule in `scripts/complexity-budgets.json` if the drift class could recur
4. Run `pnpm check:docs-drift` and `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
