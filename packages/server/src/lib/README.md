# Server Library Layout

`packages/server/src/lib/` is organized by bounded context plus shared infrastructure. `lib/` is not a single "service layer"; it contains the server's `domain`, `application`, and `infrastructure` ownership.

## Layer Ownership Inside `lib/`

| Layer | Typical Location | Responsibility |
|---|---|---|
| `domain` | `lib/<context>/` entities, repository contracts, rule helpers, lifecycle policy | Business concepts, invariants, transitions, and terms the rest of the server must honor |
| `application` | `lib/<context>/application-*.ts`, named services/processors | Use-case orchestration for commands: actor, aggregate lookup, repo writes, lifecycle/event triggering, documented compatibility seams |
| `infrastructure` | `lib/persistence/`, `lib/repos/`, `lib/queue/`, `lib/lifecycle/`, `lib/ai/`, `lib/runtime/`, compatibility store adapters | Concrete persistence, queue/runtime integration, AI adapters, startup-facing support code |

Boundary rules:

- `domain` and `application` do not own bootstrap/process lifecycle concerns.
- Runtime readiness, worker startup, migration execution, and recovery stay in infrastructure modules.
- Read-model assembly stays on the read side such as `retrieval/` or other projection modules; write-side application services should return write results, not silently assemble retrieval/runtime projections unless that coupling is explicitly documented.

## Bounded Context Modules

| Directory | Primary Ownership |
|---|---|
| `knowledge/` | Knowledge/trap/review/decay write-side domain and application services |
| `artifacts/` | Artifact lifecycle domain, repository implementations, and derived artifact support |
| `candidates/` | Candidate ingestion domain, application services, duplicate detection, resolution, and processing policy |
| `retrieval/` | Read-side retrieval orchestration, recall, scoring, capsules, graph plans, and response assembly |
| `indexing/` | Derived indexing pipeline, adapters, graph-lite, vector, keyword, and normalization |
| `governance/` | Permission and eligibility policy reused by interfaces/application flows |
| `auth/`, `users/`, `teams/` | Identity and access domain plus repository-backed application helpers |
| `feedback/`, `decay/`, `maintenance/` | Feedback/remediation and lifecycle-adjacent operator use cases |

## Shared Infrastructure

| Directory | Responsibility |
|---|---|
| `persistence/` | Store creation, migrations, Drizzle schema, and PostgreSQL store |
| `repos/` | Aggregate repository boundary exposed on `app.skillShareer.repos` |
| `queue/` | Task queue primitives and worker-facing infrastructure |
| `lifecycle/` | Event bus, lifecycle state machine, and subscribers |
| `ai/` | Provider configuration, prompts, dynamic context, and cache |
| `runtime/` | Request context, resilience policy, runtime metadata, and metrics snapshots |
| `store/` and `store.ts` | JSON compatibility store and store record types |

## Heavy-Context Placement Rules

| Context | What stays in domain/application | What stays in infrastructure/read side |
|---|---|---|
| `knowledge` | submit/resubmit/supersede/review/decay commands, lifecycle mutations, named compatibility debt | repo implementations, indexing adapters, lifecycle subscribers, startup wiring |
| `candidate ingestion` | submission, duplicate/review decisions, remediation commands, processing policy | queue transport, interrupted-candidate recovery, worker boot, PG/JSON storage details |
| `feedback/remediation` | feedback command handling, badcase/remediation state changes, reactivation decisions | persistence adapters, async subscribers/hooks, worker execution, operator transport |
| `operations/runtime` | explicitly named admin use cases only | `/health` and `/ready`, startup sequencing, runtime snapshots, migration execution, worker supervision |

## Test Placement Rule

New unit tests should be colocated with the module under test as `*.test.ts`.
Cross-domain smoke and migration guard tests may stay in `packages/server/src/__tests__/`.

## Raw-report Hotspot to lib/ Module Mapping

fm-agent 原始报告（391 已确认发现）的领域热点分布与当前 lib/ 模块的映射关系：

| 原始热点桶 | 报告数 | lib/ 模块 | 当前状态 |
|---|---|---|---|
| `lib/retrieval/capsules` | 31 | `retrieval/capsules/` | 大部分已过时（Phase 7 胶囊原生检索已落地） |
| `lib/persistence/schema` | 24 | `persistence/schema/` | 大部分已过时（多轮 Drizzle 迁移已演进） |
| `lib/retrieval/recall` | 19 | `retrieval/recall/` | 大部分已过时（PG 关键词+语义召回已落地） |
| `lib/artifacts/pg-repository` | 16 | `artifacts/pg-repository/` | 已收敛（原 `updateLifecycle` gap 已修复） |
| `lib/indexing/graph-lite` | 15 | `indexing/graph-lite/` | 大部分已过时（graph-lite 索引已就绪） |
| `lib/indexing/adapters` | 13 | `indexing/adapters/` | 大部分已过时（适配器注册表已构建） |
| `lib/ai/providers` | 12 | `ai/` | 大部分已过时（所有 providers 均已实现） |
| `lib/retrieval/orchestration` | 9 | `retrieval/orchestration/` | 全部已过时（orchestrator v1/v2 已落地） |

> `docs/plans/fm-agent-scan/server-live-gap-matrix.md` 仍保留原始热点到当前模块的映射，但 2026-05-29 审计后已无 current-live finding。
