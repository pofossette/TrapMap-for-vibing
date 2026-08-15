# Compatibility Shell Retirement and Owner-Local Infrastructure Implementation Roadmap

> **For agentic workers:** This is a deferred master roadmap. Do not execute it until root `plan.md` explicitly links a new compatibility-retirement detail. When activated, execute one owner wave at a time with TDD; do not retain compatibility re-exports, dual reads, or runtime fallbacks.

**Goal:** Retire `@trapmap/server`, `@trapmap/runtime-infra`, Fastify compatibility routes, `store_snapshot`, `JsonStore`, and `PostgresStore` by moving each concrete implementation to the service that owns its domain.

**Architecture:** `@trapmap/contracts` and `@trapmap/backend-core` remain the only shared domain and port layers. Each `service-*` package owns its concrete repositories, schema, migrations, workers, and domain infrastructure; hosts only compose services and provide transport. The release is a one-time PG-first cutover, proved against both an empty database and a legacy snapshot backfill fixture.

**Tech Stack:** TypeScript, Zod, Fastify, NestJS, `pg`, Drizzle, Vitest, Docker Compose, pnpm, Fallow.

## Activation Gate

- The Compose closeout plan at `docs/superpowers/plans/2026-07-12-compose-runtime-closeout-insert-regression.md` is green and the observability mainline has been archived.
- Root `plan.md` is switched to a new active compatibility-retirement detail that contains this roadmap's checked evidence; this file remains the detailed implementation reference.
- No service is permitted to import another service implementation. Cross-owner behavior continues through backend-core ports, internal HTTP adapters, or outbox delivery.

## Owner Map

| Wave | Destination package | Move from `packages/server/src/lib/` |
| --- | --- | --- |
| 1 | `service-identity-access` | `auth/`, `users/`, `teams/`, `actors/`, session/access-key persistence |
| 2 | `service-knowledge-write` | `knowledge/`, `artifacts/`, `labels/`, `lifecycle/`, `maintenance/`, write-side schema and outbox producer |
| 3 | `service-candidate-ingestion` | `candidates/`, `duplicates/`, `lineage/`, candidate workers and schema |
| 4 | `service-governance-review` | `feedback/`, `conflict/`, governance permissions, remediation and review projections |
| 5 | `service-job-runtime` | `queue/`, `jobs/`, workflow execution, leases, retries, dead letters and outbox dispatcher |
| 6 | `service-knowledge-read` | `retrieval/`, `indexing/`, `graph-query/`, query cache, embeddings, read models and projections |

## Task 1: Freeze the Deletion Contract

**Files:**
- Modify: `.fallowrc.json`, `scripts/arch-freeze-rules.json`, `scripts/__tests__/closeout-surface.test.ts`
- Create: `scripts/__tests__/compatibility-retirement-guard.test.ts`

- [ ] Write a failing static guard that scans production `packages/**/src` files, Dockerfiles, root scripts, and workspace package manifests for `@trapmap/server`, `@trapmap/runtime-infra`, `store_snapshot`, `JsonStore`, and `PostgresStore`.
- [ ] Allow only explicitly named migration-export fixtures until Task 9; reject all runtime imports immediately after each owner wave is switched.
- [ ] Run `pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts` and confirm the baseline is red.
- [ ] Document the temporary allowlist, its owner, and its removal task in the new active detail; do not add an allowlist entry without a deletion wave.

## Task 2: Establish Owner Migration Entrypoints

**Files:**
- Modify: `packages/host-distributed/src/migrate.ts`, `packages/host-distributed/package.json`
- Create: one migration entrypoint and migration ownership test in each `packages/service-*/src/`
- Move: `packages/server/drizzle/` SQL and metadata into owner-specific migration directories

- [ ] Write tests proving an owner migration runner accepts only its declared files and rejects another owner's file or a missing Drizzle journal tag.
- [ ] Move migration metadata with its SQL file; preserve ordered application dependencies in a host-owned migration coordinator, not in a compatibility seam.
- [ ] Run every owner migration test, then run a fresh PostgreSQL integration fixture that applies the ordered owner migration list.
- [ ] Update `docs/architecture/DATABASE_OWNERSHIP.md`, `docs/reference/DATABASE_SCHEMA.md`, and migration-operation documentation before changing deployment commands.

## Task 3: Move Identity-Access and Gateway Authentication

**Files:**
- Move: `packages/server/src/lib/auth/`, `users/`, `teams/`, `actors/` to `packages/service-identity-access/src/`
- Modify: `packages/service-identity-access/src/deps.ts`, `routes.ts`, `server.ts`
- Modify: host-local and host-distributed identity adapters and package manifests

- [ ] Port repository and route tests first; make them import only the identity package, backend-core, contracts, and `pg`.
- [ ] Replace host composition with `IdentityAccessPort` adapters and remove direct server repository imports.
- [ ] Verify identity package tests, gateway authentication acceptance, typecheck, and the Fallow boundary audit.

## Task 4: Move Knowledge Write and Its Outbox Producer

**Files:**
- Move: `knowledge/`, `artifacts/`, `labels/`, `lifecycle/`, `maintenance/` and write-owned schema to `packages/service-knowledge-write/src/`
- Modify: `packages/service-knowledge-write/src/deps.ts`, `routes.ts`, `server.ts`
- Modify: governance and candidate remote `KnowledgeWritePort` clients only as required by moved exports

- [ ] Start from failing repository, lifecycle transaction, and outbox producer tests in the destination package.
- [ ] Preserve the atomic authoritative-write-plus-outbox transaction and remove any `store_snapshot` mutation or read fallback.
- [ ] Verify lifecycle state, artifact, label, and cross-service delegation acceptance before moving the next owner.

## Task 5: Move Candidate and Governance Owners

**Files:**
- Move candidate, duplicate, lineage, and candidate worker code to `packages/service-candidate-ingestion/src/`
- Move feedback, conflict, remediation, review-queue projection, and governance permissions to `packages/service-governance-review/src/`
- Modify: both services' `deps.ts`, routes, servers, migrations, and focused tests

- [ ] Preserve candidate/governance authority locally while delegating final knowledge mutations only through `KnowledgeWritePort`.
- [ ] Prove no candidate or governance code receives a knowledge repository or a shared store.
- [ ] Run both package test suites, governance/eval smoke, and distributed acceptance after the two owner waves are green.

## Task 6: Move Job Runtime and Async Infrastructure

**Files:**
- Move: `queue/`, `jobs/`, async transport, workflow, lease, retry, dead-letter, and outbox-consumer code to `packages/service-job-runtime/src/`
- Modify: `packages/service-job-runtime/src/deps.ts`, `routes.ts`, `server.ts`
- Delete: runtime-infra async/event-bus exports after all consumers use job-runtime ports

- [ ] Write destination tests for lease reclaim, retry, dead letter, outbox dispatch, and failure-to-`InvocationError` mapping.
- [ ] Keep async callers dependent on `JobRuntimePort`, never a shared queue/repository object.
- [ ] Run job-runtime focused tests, `pnpm test:runtime-foundations`, and `pnpm test:distributed-closeout`.

## Task 7: Move Knowledge Read and Retrieval Infrastructure

**Files:**
- Move: `retrieval/`, `indexing/`, `graph-query/`, retrieval cache, embeddings, and read-model support to `packages/service-knowledge-read/src/`
- Replace: `server-retrieval-seam.ts`, `retrieval-infra-default.ts`, and `knowledge-read-support-infra-default.ts` with package-local assembly
- Delete: `packages/runtime-infra/src/knowledge-read-*.ts` after consumers switch

- [ ] Start with import-boundary tests that require no server or runtime-infra import in the destination package.
- [ ] Preserve retrieval result contracts and PG projection reads; do not recreate `store_snapshot` graph/index fallbacks.
- [ ] Run knowledge-read focused tests, `pnpm eval:smoke`, retrieval smoke, and Fallow architecture audit.

## Task 8: Move Host-Owned Runtime Surfaces

**Files:**
- Modify: `packages/host-local/src/nest/runtime/shared-infra.ts` and host-local composition
- Modify: `packages/host-distributed/src/gateway/server.ts`, telemetry imports, `migrate.ts`, Dockerfiles, and package manifests
- Move: request-context, logging, metrics, and configuration code to the owning host or service runtime

- [ ] Replace `RequestContext` and runtime imports from server with contracts or host-local types.
- [ ] Keep gateway transport-only; it must not acquire persistence or domain repositories while server routes are removed.
- [ ] Run host-local tests, distributed acceptance, observability closeout, deployment smoke, and Compose runtime closeout.

## Task 9: Backfill Once and Delete Compatibility State

**Files:**
- Create: a one-time owner-scoped legacy snapshot exporter/backfill command and its integration tests
- Delete: `store_snapshot` schema, table migration artifacts, `JsonStore`, `PostgresStore`, legacy migration/backfill scripts, compatibility fixtures, and every production call site

- [ ] Create a fixture containing every remaining legacy snapshot bucket and assert source count, destination count, required fields, and idempotency/rejection behavior.
- [ ] Run the export/backfill against a representative development database and record the result in the active detail.
- [ ] Apply the destructive schema migration only after backfill evidence is green; rerun the empty-database Compose acceptance to prove no runtime dependency remains.

## Task 10: Delete Packages and Close Documentation

**Files:**
- Delete: `packages/server/`, `packages/runtime-infra/`
- Modify: root `package.json`, lockfile, Dockerfiles, `.fallowrc.json`, scripts, Vitest projects, architecture guards, package READMEs, and system-truth references
- Modify: `docs/reference/REPO_STRUCTURE.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/architecture/BOUNDARIES.md`, `docs/architecture/SERVICE_BOUNDARIES.md`, `docs/architecture/DATABASE_OWNERSHIP.md`, and operations guides

- [ ] Remove package-graph references before deleting directories, then make the compatibility-retirement guard green with no exceptions.
- [ ] Run `pnpm typecheck`, affected package tests, `pnpm eval:smoke`, `pnpm test:distributed-acceptance`, `pnpm test:distributed-closeout`, `pnpm test:runtime-closeout:compose`, `pnpm test:deployment-smoke`, `pnpm check:docs-drift`, `pnpm check:structure`, and `pnpm exec fallow audit --base main`.
- [ ] Update the active detail with exact command results and external prerequisites, then archive it and update root `plan.md`, `docs/todos/README.md`, and `docs/archived/README.md` to retain one active execution surface.

## Completion Criteria

- All six owners build, test, migrate, and run without a shared server or runtime-infra implementation package.
- No production path, script, Dockerfile, or docs fact preserves a compatibility shell, aggregate store, or fallback owner.
- Empty-database and legacy-backfill evidence pass with the same gateway and six-service acceptance flows.
- The Fallow boundary audit reports no unauthorized cross-service implementation imports.
