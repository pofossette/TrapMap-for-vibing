# Phase 43: Migrate Store and Indexing Persistence to Database-Backed Libraries - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the architecture constraints and dependency review

<domain>
## Phase Boundary

Phase 43 should move the project's store and indexing persistence off the JSON-file-backed implementation and onto database-backed libraries aligned with the stated architecture direction.

This phase is about durable persistence infrastructure. It is not about inventing new retrieval products or changing the public CLI shape.

In scope:
- Replace the JSON file store with database-backed persistence
- Introduce an ORM/query layer suited to the monorepo's TypeScript-first architecture
- Prepare durable storage for vector, keyword, graph, audit, session, and candidate data
- Align the retrieval/indexing stack with PostgreSQL plus `pgvector`

Out of scope:
- Rewriting every domain behavior from scratch
- Replacing Fastify or the overall monorepo architecture
- Full production infra automation beyond what the persistence layer itself needs
- External search engines or dedicated graph databases

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The current JSON store has served as a prototype boundary, but it is becoming a liability as the project accumulates:
  - artifact revisions
  - candidate queues
  - graph state
  - audit history
  - retrieval indexes
- The project architecture and AGENTS guidance already point toward PostgreSQL plus `pgvector`.
- Persistence migration should preserve contract and service boundaries rather than collapse everything into direct SQL in routes.

### Target direction

- Adopt `drizzle-orm` as the database access and schema/migration layer.
- Use PostgreSQL as the source-of-truth store and `pgvector` for vector-capable retrieval state.
- Keep repository/service boundaries explicit so retrieval, governance, and artifact logic remain modular after the storage migration.
- Treat this as a staged migration: compatibility adapters may be needed while the JSON store is retired.

### Dependency decision

- Add `drizzle-orm`
- Add `pg`
- Add the migration tooling needed by Drizzle in the workspace
- Plan around PostgreSQL plus `pgvector`; do not introduce a second vector store
- Do not introduce Prisma for this phase

</decisions>

<code_context>
## Existing Code Insights

### The current store is a broad JSON aggregate

- The current persistence layer lives in [store.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/store.ts:1).
- It currently carries users, teams, memberships, sessions, knowledge, artifacts, indexing state, and candidate workflow data in one file-backed model.

### Indexing state is already structured enough to migrate

- Knowledge entries already track per-adapter sync state in [store.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/store.ts:158).
- That structure is a good starting point for relational tables rather than evidence that the JSON store should continue.

### Architecture guidance already points to PostgreSQL plus pgvector

- Project guidance explicitly recommends PostgreSQL plus `pgvector` and Drizzle for vector-aware TS-native persistence in [AGENTS.md](/home/wunai/project/TrapMap-for-vibing/AGENTS.md:30).

### Retrieval and indexing are now accumulating enough state to justify the move

- Graph indexing, candidate processing, artifact derivation, and audit logging all increase pressure on the existing file-backed prototype store.
- Phase 43 is the natural place to harden persistence before the GraphRAG-lite runtime grows further.

</code_context>

<specifics>
## Specific Ideas

- Model relational tables for:
  - users, teams, memberships, sessions
  - knowledge entries and revisions
  - skill artifacts and revisions
  - candidate submissions and duplicate cases
  - audit events
  - retrieval/indexing adapter state
- Keep graph runtime data reconstructable from relational state unless there is a clear reason to persist a separate denormalized graph cache.
- Add migration and compatibility tests so behavior can be compared before and after the storage switch.
- Preserve deterministic IDs and revision history through the migration.

</specifics>

<deferred>
## Deferred Ideas

- Dedicated graph database adoption
- External search engine adoption
- Full online migration orchestration
- Multi-tenant operational hardening beyond current scope

</deferred>
