# Wave 8 Graph Query Owner Design

## Goal

Remove the remaining host-local runtime dependency on `@trapmap/server` by making
`@trapmap/service-knowledge-read` the owner of the in-memory graph-query core.
The migration must preserve graph-query behavior and leave server-only Neo4j
configuration, projection, health, and fail-open orchestration in `server`.

## Scope

This is the next Wave 8 host-surface tranche. It changes the implementation
ownership of the memory graph backend and the graphology utilities it requires.
It does not close Wave 8, delete `packages/server`, retire Neo4j support, or
authorize any Wave 9 `store_snapshot` deletion.

## Current State

`packages/host-local/src/nest/runtime/shared-infra.ts` creates a PostgreSQL
`GraphIndexRepositoryPort` from `service-knowledge-read`, but imports
`createMemoryGraphQueryBackend` and its types from
`@trapmap/server/lib/graph-query/index.js`. The memory backend in turn imports
server-owned graphology utilities and boundary normalization. This violates the
intended owner direction: host-local composition must use the knowledge-read
owner directly, not server implementation internals.

`service-knowledge-read/src/context.ts` already declares a narrow graph-query
interface for owner retrieval. The server graph-query interface has a broader
surface because it also supports indexing updates, health checks, local
expansion views, and Neo4j. The duplicate interfaces can drift and prevent a
single backend from being safely passed through host composition and server
retrieval.

## Chosen Architecture

Move the provider-agnostic graph-query contract, the memory implementation,
and the graphology/boundary-normalization helpers needed by that implementation
to `@trapmap/service-knowledge-read`.

The knowledge-read public entry point will export:

- `GraphQueryBackend`, its backend/runtime/health/view types, and the memory
  backend factory.
- The graph runtime snapshot, graph assembly, bounded expansion, hard-cycle
  validation, and boundary-node normalization helpers required by the memory
  backend and server consumers.

The shared `GraphQueryBackend` remains the complete interface currently needed
by server indexing, retrieval, and Neo4j composition: backend kind/enabled
state, runtime state, health check, projection update/remove/rebuild methods,
source expansion/strength methods, source-node lookup, bounded local expansion,
and mitigating-skill lookup. `KnowledgeReadGraphQueryBackend` and
`KnowledgeReadGraphQueryRuntimeState` become aliases of, or are replaced by,
this canonical contract so owner retrieval and server composition share exactly
one structural definition.

Move only the graphology helpers from the server graph-lite aggregate. Document
builders, graph extraction, cache, store compatibility helpers, and indexing
pipeline logic stay in server for this tranche. Server imports the moved graph
core through `@trapmap/service-knowledge-read`; it does not receive a reverse
import from the owner package.

Server retains:

- Graph DB environment parsing and the resulting runtime-state policy.
- Neo4j client creation, Cypher projection, connectivity checking, and
  fail-open wrapper.
- Bootstrap selection between Neo4j and the owner-provided memory backend.

The server Neo4j backend implements the canonical knowledge-read contract. Its
fallback backend is the same memory implementation that host-local uses.

## Dependency Rules

The permitted production dependency direction after this tranche is:

```text
host-local -> service-knowledge-read
server     -> service-knowledge-read
server     -> server-only Neo4j/config/health modules
```

`service-knowledge-read` must not import `@trapmap/server`. `host-local` must
not import any `@trapmap/server/lib/graph-query/*` module. No server re-export,
compatibility shim, duplicate memory backend, or dynamic runtime fallback is
allowed.

The graphology dependencies become direct dependencies of
`@trapmap/service-knowledge-read`, because it executes the graph algorithms.
They are removed from `@trapmap/server` only when no remaining server code uses
them directly.

## Runtime Behavior

Host-local continues to require PostgreSQL before composing its graph projection
and continues to use `{ backendKind: 'memory', mode: 'disabled', failOpen: true
}` as its host-local runtime metadata. The memory backend itself retains its
existing disabled state and successful health check. It uses the owner-local
`GraphIndexRepositoryPort` as the canonical source for every query and update.

Server startup behavior remains unchanged: it constructs a memory backend,
optionally wraps a healthy Neo4j primary with the server fail-open wrapper, and
publishes the server-derived runtime state. There is no behavior change to
Neo4j credentials, connectivity failures, or fail-open policy.

## Error Handling

The migration preserves current failure boundaries:

- Host-local without `DATABASE_URL` fails before allocating a pool.
- Owner graph repository errors propagate from the memory backend; no snapshot
  or in-memory compatibility data source is introduced.
- Server continues to decide whether a Neo4j health failure is fail-open or
  fail-closed from its existing graph DB configuration.

## Testing And Verification

Implementation must first add or adapt tests that prove:

- The owner package's memory backend preserves expansion, relation-strength,
  node lookup, local expansion, and projection delegation behavior.
- Host-local constructs the memory backend from `service-knowledge-read` and
  has no server graph-query import.
- Server Neo4j and fail-open paths still satisfy the canonical contract.
- The import-boundary guard rejects a restored host-local server graph-query
  import and the owner package has no server import.

Required validation after implementation:

```bash
rtk pnpm --filter @trapmap/service-knowledge-read test
rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/import-boundary.test.ts
rtk pnpm --filter @trapmap/server test --run src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts
rtk pnpm typecheck
rtk pnpm exec fallow audit --base main --format json --quiet 2>/dev/null || true
```

The Fallow report must be examined for introduced cross-package boundary
violations, dead graph-query exports, dependencies, duplication, and complexity.
An unrelated inherited full-branch Fallow finding is not evidence that this
tranche failed, but it must not be suppressed by this migration.

## Documentation And Completion Evidence

The compatibility-retirement detail must record the exact implementation,
test, typecheck, and architecture-boundary evidence. The Wave 8 allowlist is
updated only for the removed host-local graph-query import. It remains open
until all of its host/gateway/server compatibility entries are removed and its
broader acceptance evidence is complete.

No public API, environment variable, or deployment default changes in this
tranche require an operations-document update. The active retirement detail is
the required factual record.
