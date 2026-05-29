# Server Library Layout

`packages/server/src/lib/` is organized by domain and shared infrastructure.

## Domain Modules

| Directory | Responsibility |
|---|---|
| `knowledge/` | Knowledge application service and repositories |
| `artifacts/` | Skill artifact model, repository, reconstruction, and derived data |
| `candidates/` | Candidate submission, duplicate detection, resolution, and processing |
| `retrieval/` | v1/v2/v3 retrieval orchestration, recall, scoring, capsules, graph plans, and response assembly |
| `indexing/` | Index event pipeline, adapters, graph-lite, vector, keyword, and normalization |
| `governance/` | Permission and eligibility checks |
| `auth/`, `users/`, `teams/` | Identity, sessions, teams, and membership repositories |
| `feedback/`, `decay/`, `maintenance/` | Lifecycle-adjacent operator domains |

## Shared Infrastructure

| Directory | Responsibility |
|---|---|
| `persistence/` | Store creation, migrations, Drizzle schema, and PostgreSQL store |
| `repos/` | Aggregate repository boundary exposed on `app.skillShareer.repos` |
| `queue/` | Task queue primitives |
| `lifecycle/` | Event bus, lifecycle state machine, and subscribers |
| `ai/` | Provider configuration, prompts, dynamic context, and cache |
| `store/` and `store.ts` | JSON compatibility store and store record types |

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
| `lib/artifacts/pg-repository` | 16 | `artifacts/pg-repository/` | 混合（1 活跃：updateLifecycle） |
| `lib/indexing/graph-lite` | 15 | `indexing/graph-lite/` | 大部分已过时（graph-lite 索引已就绪） |
| `lib/indexing/adapters` | 13 | `indexing/adapters/` | 大部分已过时（适配器注册表已构建） |
| `lib/ai/providers` | 12 | `ai/` | 大部分已过时（所有 providers 均已实现） |
| `lib/retrieval/orchestration` | 9 | `retrieval/orchestration/` | 全部已过时（orchestrator v1/v2 已落地） |

> 活跃发现（非过时）主要是 bootstrap、config 和 ai/dynamic：完整矩阵见 `temp/fm-agent-scan-plans/server-live-gap-matrix.md`。
