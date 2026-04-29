# Phase 43 Research: Store and Indexing Persistence to Database-Backed Libraries

**Date:** 2026-04-25
**Phase:** 43
**Status:** Ready for planning

## Context

Phase 43 is the point where TrapMap stops treating the file-backed `JsonStore` as the durable persistence boundary. The current server persists users, teams, memberships, sessions, knowledge, artifacts, candidate workflow state, and graph index documents into one JSON file at `TRAPMAP_DATA_FILE`. That was sufficient for the prototype, but the current codebase now has enough stateful behavior that filesystem persistence is the main architectural mismatch against the project's stated PostgreSQL + Drizzle direction.

TrapMap retrieval gating remained blocked during this phase setup: `pnpm --filter @trapmap/cli dev session --json` returned HTTP `404`, so this research is based on local code and project architecture rather than live TrapMap knowledge retrieval.

## Current Code Reality

### The active seam is smaller than the aggregate behind it

Callers depend on a small store contract:

- `snapshot(): Promise<StoreData>`
- `transact<T>(mutator): Promise<T>`
- `nextId(data, prefix): string`

The real surface area is `StoreData`, not file I/O details. Most services mutate a full in-memory aggregate inside `transact` and expect serialized write behavior. That means a compatibility-preserving database migration is feasible without rewriting every route and service into repository methods first.

### The main risk is transaction semantics, not reads

The riskiest behavior is code that expects one mutable aggregate snapshot and a single atomic commit after cross-collection edits. `packages/server/src/lib/indexing/reconcile.ts` is the clearest hotspot because it mixes graph removals, rebuilds, and validation behavior inside one transactional mutation.

### Indexing state is already part of the persisted aggregate

The current file store already persists:

- `embeddingCache`
- `indexState`
- `graphIndexDocuments`
- candidate and duplicate-review workflow state

Moving the aggregate to PostgreSQL immediately moves the indexing persistence boundary as well, even if the first database-backed implementation keeps a compatibility-oriented JSONB snapshot rather than a fully decomposed relational model.

## Options Considered

### 1. Full relational rewrite in Phase 43

Model every aggregate root and index payload as first-class relational tables now, then rewrite callers around repositories.

Why not now:

- Too many services mutate `StoreData` directly.
- The migration would balloon into route/service rewrites instead of a persistence-boundary change.
- It creates a high regression risk for candidate reconciliation and indexing behavior in one phase.

### 2. PostgreSQL compatibility store backed by Drizzle (recommended)

Introduce a database-backed store implementation that preserves the current `snapshot/transact/nextId` contract while storing the aggregate durably in PostgreSQL. Use Drizzle for schema definitions and runtime access. Keep JSON file persistence as an explicit fallback path for local/dev compatibility.

Why this is the right phase shape:

- It moves persistence off the filesystem now.
- It keeps existing domain logic intact.
- It creates a clean seam for later relational decomposition of specific domains and pgvector-native indexing tables.
- It is realistic to execute and verify within one phase.

### 3. Index-only database migration while leaving the main store on JSON

Persist graph/vector/keyword payloads in the database first but keep the main domain store file-backed.

Why not now:

- The architecture mismatch remains because sessions, governance state, candidate workflow state, and knowledge lifecycles still live in one JSON file.
- It would split durability rules across two persistence systems without first establishing the database as the source of truth.

## Recommended Implementation Shape

### Persistence model for this phase

- Add a shared `SkillShareerStore` interface that matches the existing runtime contract.
- Keep `JsonStore` as the file-backed implementation of that interface.
- Add a PostgreSQL-backed implementation using `drizzle-orm` and `pg`.
- Persist one canonical `StoreData` snapshot row in PostgreSQL JSONB so current services can keep mutating the aggregate inside `transact`.
- Use row locking in `transact` so the database-backed implementation preserves the existing serialized write semantics as closely as possible.
- Use `TRAPMAP_DATABASE_URL` as the activation gate for the PostgreSQL-backed store; otherwise keep the current file-backed path.

### Why JSONB-first is acceptable here

This phase is about changing the durability boundary, not finishing the final relational model. JSONB-first storage is a compatibility adapter that lets the server move to PostgreSQL immediately while keeping behavior stable. Later phases can peel specific domains and indexing payloads into dedicated relational or pgvector-aware tables without forcing that rewrite now.

### Minimum supporting foundation

- Drizzle schema for the persisted snapshot row
- A store factory/selector in server bootstrap
- Regression tests for snapshot reads, transactional writes, and ID allocation
- Production type signatures widened from `JsonStore` to the shared store interface

## Risks and Guardrails

### Risks

- `transact` semantics drift under concurrent updates
- Startup/on-ready flows assume a ready-to-use store with no explicit initialization step
- Tests and service signatures currently leak `JsonStore` as a concrete type

### Guardrails

- Preserve the exact `snapshot/transact/nextId` contract
- Keep `StoreData` unchanged in this phase
- Keep `JsonStore` fallback for existing local workflows and tests
- Add focused regression coverage for the database-backed store and the type-widened caller surface

## Planned Outcome

After Phase 43, TrapMap should be able to run with PostgreSQL-backed persistence through a compatibility store layer while preserving current domain behavior and existing indexing flows. The filesystem JSON store remains a supported fallback, but it is no longer the only durable persistence option.
