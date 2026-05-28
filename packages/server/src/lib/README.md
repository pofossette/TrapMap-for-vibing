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
