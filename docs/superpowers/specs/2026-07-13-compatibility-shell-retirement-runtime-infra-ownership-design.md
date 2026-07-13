# Compatibility Shell Retirement and Owner-Local Infrastructure Design

## Goal

Remove the Fastify compatibility shell, `@trapmap/server`, `@trapmap/runtime-infra`, `store_snapshot`, `JsonStore`, `PostgresStore`, and every production fallback that relies on them. Replace shared infrastructure ownership with owner-local implementations in the six `service-*` packages, while retaining `@trapmap/contracts` and `@trapmap/backend-core` as the only cross-service contract layers.

## Scope and Non-Goals

This is a development-stage, one-time migration. It does not provide a dual-read period, compatibility re-exports, a legacy HTTP route, or a fallback to JSONB/in-memory state. The cutover must leave an empty database and a migrated development database both usable through the six-service runtime.

The work does not introduce physical database-per-service, two-phase commit, a service mesh, or a production platformization claim. PostgreSQL remains a shared instance with table ownership and outbox-based cross-service consistency.

## Current Constraints

- `packages/server` currently contains the Fastify shell plus shared persistence, retrieval, provider, migration, and runtime implementation.
- `packages/runtime-infra` imports server implementation directly, making it a transitional shared owner rather than a stable boundary.
- `store_snapshot` is an aggregate JSONB compatibility store. It must not survive as a runtime read, write, fallback, fixture, backfill dependency, or schema object after cutover.
- Cross-service behavior remains port-first: `backend-core` owns ports and invocation semantics; `contracts` owns shared schema and wire shapes.
- Each authoritative table has one owner. Cross-owner writes use internal ports, HTTP, outbox, and workers, never shared repositories or direct writes.

## Chosen Architecture

### Owner-Local Implementations

Each of the six service packages owns only the concrete infrastructure needed for its domain:

| Owner package | Local implementation ownership |
| --- | --- |
| `service-identity-access` | identity, sessions, access keys, teams, membership repositories and migrations |
| `service-knowledge-read` | retrieval, embeddings, graph/index/query infrastructure, read projections and migrations |
| `service-knowledge-write` | knowledge, lifecycle, artifacts, labels, evidence repositories, lifecycle outbox production and migrations |
| `service-candidate-ingestion` | candidate, deduplication, lineage repositories, candidate workers and migrations |
| `service-governance-review` | governance queues, review decisions, feedback/remediation repositories, workers and migrations |
| `service-job-runtime` | task queue, workflow, outbox dispatch, retries, leases, dead letters and migrations |

Implementations are not copied mechanically into every package. A service receives only the concrete code it owns and actually executes. The common code remains limited to contracts and backend-core ports; no new catch-all infrastructure package replaces `runtime-infra`.

### Host Responsibilities

`host-local` and `host-distributed` own composition, configuration parsing, HTTP transport, service addresses, dependency injection, correlation propagation, and external gateway behavior. The gateway remains the sole external API surface, does not receive a domain repository, and invokes owner ports only.

Services do not deep-import another service's implementation. A remote or in-process adapter translates transport behavior to the port contract, including `InvocationError`, timeouts, correlation headers, and permission context.

### Persistence and Migration Ownership

Every owner package contains its domain schema definitions, migration files, migration metadata, and migration runner entry. Deployment invokes owner migrations in a documented dependency order. The migration guard verifies both owner metadata and Drizzle journal coverage for every migration.

The sole allowed use of `store_snapshot` during the change is an explicitly named one-time export/backfill command that reads legacy data and writes owner tables through their owner-local repositories. Its data-integrity checks must complete before deleting the legacy table, migration artifacts, scripts, fixtures, and source imports. No production runtime may read or write it during the transition.

### Runtime and Failure Semantics

Each service exposes `/live`, `/ready`, ownership metadata, and diagnostics for its own required dependencies, queue/outbox work, retries, leases, and projection lag where applicable. Optional telemetry sinks report `degraded` diagnostics without incorrectly blocking readiness. A service failure remains attributable to its owner; the gateway must never fall back to local shared implementation.

## Cutover Sequence

1. Move domain-local implementations and tests into their six owner packages, preserving external port contracts.
2. Redirect hosts, workers, CLI scripts, test fixtures, operational scripts, Dockerfiles, and package dependencies to owner packages and host-owned composition.
3. Add per-owner migrations and a one-time legacy snapshot export/backfill command with row-count and domain-integrity assertions.
4. Run the backfill against a representative development database; verify owner tables and service APIs, then remove the snapshot table and all legacy code in the same change set.
5. Delete `packages/server` and `packages/runtime-infra`, their package dependencies, Fastify compatibility routes, exports, scripts, tests, architecture exceptions, and documentation claims.
6. Prove the new system from an empty database and through the full six-service Compose acceptance path; document the completed retirement and archive the active execution detail only after all required evidence is recorded.

## Verification Strategy

- Focused package tests prove each owner-local repository, migration, worker, and adapter behavior.
- Static guards reject production imports of `@trapmap/server`, `@trapmap/runtime-infra`, `store_snapshot`, `JsonStore`, and `PostgresStore`.
- Migration tests reject a migration missing owner metadata or a journal entry, and reject owner packages from running another owner's migrations.
- Backfill tests compare source records with owner-table counts and required domain fields, and prove a rerun is safe or rejected explicitly.
- Empty-database Compose acceptance starts gateway and all six services, runs their migrations, validates health/ownership surfaces, and executes representative gateway-to-owner flows.
- Existing distributed acceptance, observability closeout, deployment smoke, typecheck, documentation drift/structure checks, and Fallow boundary audit validate the cross-package result.

## Alternatives Considered

### Put all server code in `runtime-infra`

This minimizes file moves but turns a transitional seam into a broad shared repository, retrieval, provider, and host-composition owner. It conflicts with the established boundary rule that unified adapters must not become a mega-adapter.

### Preserve compatibility wrappers or dual reads

This lowers immediate cutover risk but contradicts the development-stage requirement for a clean migration and preserves an ambiguous owner path. It is rejected.

### Duplicate all implementation in all six services

Literal duplication would isolate packages but create six maintenance copies of unrelated behavior. The chosen design instead uses owner-local implementation: only the service that owns a domain carries its implementation.

## Completion Criteria

- `packages/server` and `packages/runtime-infra` no longer exist in the workspace or package graph.
- The workspace has no production source, Dockerfile, script, fixture, or documentation reference that preserves a runtime dependency on the retired packages or on `store_snapshot` compatibility behavior.
- Every owner can migrate its own tables and no other owner's tables.
- Gateway and all six services pass from an empty database; representative migrated legacy data passes the one-time backfill integrity checks.
- All external behavior continues through contracts and backend-core ports, with no Fastify compatibility route or shared repository fallback.
- Architecture, operations, package READMEs, system-truth sources, dependency boundaries, and regression commands describe the owner-local model accurately.
