# Database Ownership Rules

> Frozen by Task 00 of the runtime recomposition plan. This document defines table-level ownership, transaction boundary rules, and Phase 1 constraints for the shared PostgreSQL database.

## Status

- Phase: 1 (shared PostgreSQL, explicit ownership)
- Supersedes any implicit "everyone writes everything" convention

## Guiding Principles

1. **One authoritative writer per table.** No authoritative table should have more than one owning service responsible for writes.
2. **Shared database is not shared write permission.** Even though all services connect to the same PostgreSQL instance, table-level write ownership is strictly enforced at the module boundary.
3. **Cross-service consistency via outbox, not distributed transactions.** Phase 1 does not introduce cross-database distributed transactions or two-phase commit.
4. **Read-side state is derived.** Projections, caches, and search indexes are derived from events emitted by write-side services. They can be rebuilt.

## Table-Level Ownership

### identity-access (write-only)

The `identity-access` service owns the following tables for all authoritative writes:

| Table family | Examples | Ownership |
|---|---|---|
| Auth / session | `sessions`, session-related tables | `identity-access` write |
| Access keys | `access_keys`, `pg_access_keys` | `identity-access` write |
| Users | `users`, `pg_users` | `identity-access` write |
| Teams | `teams`, `pg_teams` | `identity-access` write |
| Memberships | `memberships`, `pg_memberships` | `identity-access` write |

Other services may read these tables through the `IdentityAccessPort` defined in `backend-core`. No other service writes to these tables directly.

### knowledge-write (write-only)

The `knowledge-write` service owns the following tables for all authoritative writes:

| Table family | Examples | Ownership |
|---|---|---|
| Knowledge entries | `knowledge_entries`, `knowledge_labels`, `knowledge_boundary_*`, `knowledge_maintenance_assignments` | `knowledge-write` write |
| Knowledge revisions | `knowledge_revisions` | `knowledge-write` write |
| Lifecycle events | `lifecycle_events` | `knowledge-write` write |
| Skill artifacts | `skill_artifacts`, `artifact_revisions`, `skill_artifact_*` (metadata, files, script descriptors, profiles, capsules, client manifests, boundary, maintenance, agent reviews) | `knowledge-write` write |
| Artifact lifecycle events | `artifact_lifecycle_events` | `knowledge-write` write |
| Decay metadata | decay state columns, decay config | `knowledge-write` write |
| Evidence | evidence metadata tables | `knowledge-write` write |
| Feedback | `feedback` tables | `knowledge-write` write |

Other services may read these tables through internal ports. If `candidate-ingestion` needs to publish a new knowledge entry, or `governance-review` needs to approve/reject/apply maintenance/apply decay, they do so via the remote `KnowledgeWritePort` command surface. They do not write `knowledge_entries`, lifecycle tables, or maintenance/decay truth tables directly.

### candidate-ingestion (write-only)

The `candidate-ingestion` service owns the following tables for all authoritative writes:

| Table family | Examples | Ownership |
|---|---|---|
| Candidates | `candidates` | `candidate-ingestion` write |
| Candidate analyses | `candidate_analyses` | `candidate-ingestion` write |
| Candidate manual results | `candidate_manual_results` | `candidate-ingestion` write |
| Candidate resolution outcomes | `candidate_resolution_outcomes` | `candidate-ingestion` write |
| Duplicate cases | `candidate_duplicate_cases`, `candidate_duplicate_matches` | `candidate-ingestion` write |
| Entity lineage | `entity_lineage` | `candidate-ingestion` write |

When candidate resolution produces a published entity (knowledge entry or skill artifact), the write to the target domain table is performed by the owning service (`knowledge-write`), not by `candidate-ingestion`.

### governance-review (write-only)

The `governance-review` service owns the following tables for all authoritative writes:

| Table family | Examples | Ownership |
|---|---|---|
| Human intervention queues | review queue state tables | `governance-review` write |
| Review workbench state | workbench session tables | `governance-review` write |
| Conflict resolution state | conflict detection and resolution tables | `governance-review` write |
| Remediation queue state | remediation task tables, suppression state | `governance-review` write |

`governance-review` does not directly modify knowledge lifecycle truth tables. When a review decision changes a knowledge entry's lifecycle state, or when maintenance / decay changes the final knowledge aggregate state, the decision flows through the remote `KnowledgeWritePort` command, and `knowledge-write` performs the authoritative mutation.

### job-runtime (write-only)

The `job-runtime` service owns the following tables for all authoritative writes:

| Table family | Examples | Ownership |
|---|---|---|
| Task queue | `task_queue` | `job-runtime` write |
| Workflow runs | `workflow_runs` | `job-runtime` write |
| Outbox dispatch runtime | `domain_event_outbox`, outbox processing state | `job-runtime` write |
| Lease / reclaim metadata | task lease, reclaim counters, dead-letter state | `job-runtime` write |

`job-runtime` does not own any business domain truth tables. It only executes work dispatched by other services and manages the runtime machinery for task lifecycle, retries, and dead-letter handling.

### knowledge-read (read-only projections)

The `knowledge-read` service does NOT own any authoritative truth tables. It may own:

| Table family | Examples | Ownership |
|---|---|---|
| Read-only projections | materialized views, denormalized read models | `knowledge-read` write (derived only) |
| Cache tables | external cache index metadata | `knowledge-read` write (derived only) |
| Search index tables | `knowledge_embeddings`, `knowledge_keywords`, `knowledge_search_documents`, `graph_index_documents` | `knowledge-read` write (derived only) |
| Query trace read-side | `retrieval_badcase_traces`, query analytics | `knowledge-read` write (derived only) |

These tables are derived from events emitted by `knowledge-write` and other authoritative services. They can be rebuilt from the authoritative source at any time.

## Read Access Rules

- Any service may read tables it owns.
- For tables owned by another service, reading must go through the appropriate internal port (defined in `backend-core`) rather than direct table access. Exception: during Phase 1, while services still share a single `packages/server` codebase, direct reads are permitted but must be documented at the call site with a comment: `// PHASE-1-TEMPORARY: direct read from <table>; replace with projection read after Phase 2`
- `knowledge-read` may read directly from authoritative tables during Phase 1 and the Phase 2 boundary-close posture, but only for explicitly declared temporary direct-backed projections surfaced by `GET /internal/knowledge-read/projection-status` or its gateway-forwarded mirror at `GET /v1/knowledge/projection-status`. Retrieval/search/query-trace surfaces are not covered by this allowance.
- `governance-review` owns review queue, maintenance operator views, and decay workbench reads. If a governance-facing read still needs shared authoritative state in Phase 2, it must be documented as a temporary direct-backed operator projection rather than being folded into `knowledge-read`.

## Transaction Boundary Rules

### Single-service transaction

Each owning service may use a local PostgreSQL transaction to guarantee atomicity of:

- Authoritative write (e.g., insert a new knowledge entry)
- Local outbox write (e.g., append a lifecycle transition event to `domain_event_outbox`)

Both operations commit or roll back together. This is the primary consistency mechanism.

```
BEGIN;
  INSERT INTO knowledge_entries (...);
  INSERT INTO domain_event_outbox (...);
COMMIT;
```

### Cross-service flow

Multiple services' writes MUST NOT be wrapped in a single cross-service database transaction. Cross-service flows follow this pattern:

1. **Authoritative write**: the owning service writes to its authoritative table and appends to its local outbox in a single transaction.
2. **Outbox append**: the outbox event is committed atomically with the authoritative write.
3. **Async delivery**: `job-runtime` picks up the outbox event and delivers it to the target service.
4. **Projection / follow-up**: the target service processes the event and updates its own state (projection table, cache invalidation, command dispatch to another owning service).

```
Service A:  BEGIN; write_authoritative; append_outbox; COMMIT;
                  ↓ (async)
job-runtime:     pick up outbox event → deliver to Service B
                  ↓
Service B:  BEGIN; update_projection; append_own_outbox; COMMIT;
```

### Sync query + async follow-up

Gateway or sync callers receive an immediate response indicating "received / authorized / written" after the authoritative write commits. Callers MUST NOT assume that:

- Projections have been updated
- Cache invalidation has completed
- Governance side effects have been processed
- Read-side indexes reflect the latest write

This is by design. The sync response guarantees durability of the authoritative write; the async follow-up guarantees eventual consistency of derived state.

### Prohibited patterns

| Pattern | Why prohibited |
|---|---|
| Cross-service BEGIN/COMMIT spanning multiple services | Violates service ownership boundary; creates hidden coupling |
| Service A directly writing to Service B's authoritative table | Violates single-writer ownership rule |
| Assuming projection is up-to-date after sync write returns | Violates async follow-up contract |
| Using shared database connection as implicit distributed transaction | No isolation between services; rollback semantics are undefined |

## Phase 1 Constraints

1. **Shared PostgreSQL**: all services connect to the same `TRAPMAP_DATABASE_URL`. This is a temporary arrangement; it does not imply shared write permission.
2. **No distributed transactions**: no two-phase commit, no XA transactions, no cross-service `BEGIN`/`COMMIT`.
3. **Outbox is the cross-service consistency mechanism**: all cross-service state propagation goes through outbox + queue + async delivery.
4. **Ownership enforced at module boundary**: even though services share a database connection, each service's repository layer must only access its owned tables for writes.
5. **Projection rebuild is permitted**: `knowledge-read` can rebuild its projection tables from authoritative events at any time. This is the recovery mechanism for derived state.

## Database Access Pattern Summary

| Service | Authoritative writes | Reads own tables | Reads other services' tables |
|---|---|---|---|
| `identity-access` | auth, session, access-key, user, team, membership | Yes | Via `IdentityAccessPort` |
| `knowledge-write` | knowledge, artifact, lifecycle, decay, maintenance, evidence, feedback | Yes | Via internal ports |
| `candidate-ingestion` | candidate, duplicate case, lineage | Yes | Via remote `KnowledgeWritePort` for publishing |
| `governance-review` | review queue, workbench, conflict, remediation | Yes | Via remote `KnowledgeWritePort` for approve/reject/maintenance/decay |
| `job-runtime` | task queue, workflow runs, outbox | Yes | Via internal ports (for event delivery) |
| `knowledge-read` | projections, search indexes, query traces (derived only) | Yes | Phase 2: only explicitly declared temporary direct-backed entry projections may direct-read; retrieval/search/query-trace stay derived |

## Future Database Evolution

### Phase 2: Shared schema hygiene

- Clear table grouping and naming conventions per owning service
- Explicit documentation of which service may write to which table
- Schema migration ownership: each service's migrations only touch its owned tables

### Phase 3: Projection hardening

- Read-side projections, governance queue state, and async runtime state converge to owning services
- Route-local ad-hoc queries replaced by explicit projection tables

### Phase 4: Selective split evaluation

Database splitting is evaluated only when one or more of these conditions are met:

- A single service requires independent scaling and database hotspots concentrate in that domain
- A domain requires independent backup / restore / retention policies
- A domain's access pattern causes stable interference with the main database
- Security or compliance requirements mandate independent data boundaries

Until these thresholds are met, table-level ownership, transaction boundaries, and projection governance are sufficient.

## Connection and Capacity Planning

- Each service MUST support independent pool size, idle timeout, and statement timeout configuration.
- `knowledge-read` and `job-runtime` are the highest connection-usage services; monitor first.
- Do not default to single-connection-pool-per-process values from the monolith era.

## References

- [Target Architecture](TARGET_ARCHITECTURE.md) -- package roles, deployment roles, service roles
- [Service Boundaries](SERVICE_BOUNDARIES.md) -- service role definitions and ownership model
- [Runtime Recomposition Plan 00](../plans/runtime-recomposition/00-baseline-and-target-architecture.md) -- plan origin, database principles
- [Runtime Recomposition Plan 04](../plans/runtime-recomposition/04-heavy-microservice-assembly.md) -- database processing strategy, table-level ownership, transaction boundaries
