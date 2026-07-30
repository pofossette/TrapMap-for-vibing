# Wave 8 Graph Query Owner Design

## Goal

Remove the remaining host-local runtime dependency on `@trapmap/server` by making
`@trapmap/service-knowledge-read` the owner of the in-memory graph-query
implementation while communicating with compatibility code through contracts.
The migration must preserve graph-query behavior without adding a forbidden
`server -> service-knowledge-read` dependency.

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

## Revised Architecture

The first attempted implementation moved the complete graph-query core to
`service-knowledge-read` and made server import it. Review rejected that change:
the authoritative Fallow configuration permits server to import only contracts
and persistence-schema, and a clean checkout could not reproduce tests that
resolved the owner package from ignored `dist/` output. That commit was reverted.

Place the provider-neutral graph-query port and pure graph-topology helpers in
`@trapmap/contracts`. The contract contains the structural graph view, runtime
state, backend interface, graph document operations, boundary normalization,
and pure graph assembly/query helpers. It has no dependency on either service
or server implementation.

`service-knowledge-read` owns `createMemoryGraphQueryBackend`. It implements
the contracts port using its owner-local `GraphIndexRepositoryPort` and calls
the contracts graph helpers. `host-local` creates that backend and injects the
contracts port where a compatibility server composition is still required.

`GraphQueryBackend` remains complete: backend kind/enabled state, runtime
state, health check, projection update/remove/rebuild methods, source
expansion/strength methods, source-node lookup, bounded local expansion, and
mitigating-skill lookup. `KnowledgeReadGraphQueryBackend` and
`KnowledgeReadGraphQueryRuntimeState` alias the contracts definitions.

Document builders, graph extraction, cache, store compatibility helpers, and
indexing pipeline logic stay in server. Existing server graph-query code imports
the canonical port and pure graph helpers from contracts. It no longer imports
the memory factory, does not re-export it, and does not construct a default
memory backend. A server startup that needs graph query behavior receives the
host-created port through `BuildServerOptions`; a missing optional backend
disables graph-only channels rather than silently creating a second backend.

Server retains:

- Graph DB environment parsing and the resulting runtime-state policy.
- Neo4j client creation, Cypher projection, connectivity checking, and
  fail-open wrapper.
- Neo4j construction only when explicitly configured and a host-provided
  fallback port is available.

The server Neo4j backend implements the contracts port. Its fail-open fallback
is the same host-provided memory implementation that host-local uses.

## Dependency Rules

The permitted production dependency direction after this tranche is:

```text
host-local -> service-knowledge-read
host-local -> server (only when composing compatibility server)
server     -> contracts
service-knowledge-read -> contracts
server     -> server-only Neo4j/config/health modules
```

`service-knowledge-read` must not import `@trapmap/server`. `host-local` must
not import any `@trapmap/server/lib/graph-query/*` module. `server` must not
import `@trapmap/service-knowledge-read`. No server re-export, compatibility
shim, duplicate memory backend, or dynamic runtime fallback is allowed.

The graphology dependencies become direct dependencies of `@trapmap/contracts`,
because its pure graph helpers execute the algorithms. They are removed from
both server and knowledge-read once no remaining source imports them directly.

## Runtime Behavior

Host-local continues to require PostgreSQL before composing its graph projection
and continues to use `{ backendKind: 'memory', mode: 'disabled', failOpen: true
}` as its host-local runtime metadata. The memory backend retains its existing
disabled state and successful health check. It uses the owner-local
`GraphIndexRepositoryPort` as the canonical source for every query and update.

Server startup no longer constructs a memory backend. With an injected fallback
port it can wrap a healthy Neo4j primary using the existing fail-open policy;
without one it publishes disabled graph-query state and does not register
graph-only channels. There is no behavior change to Neo4j credentials,
connectivity failures, or fail-open policy when a host injects the port.

## Error Handling

The migration preserves current failure boundaries:

- Host-local without `DATABASE_URL` fails before allocating a pool.
- Owner graph repository errors propagate from the memory backend; no snapshot
  or in-memory compatibility data source is introduced.
- Server continues to decide whether a Neo4j health failure is fail-open or
  fail-closed from its existing graph DB configuration.

## Testing And Verification

Implementation must first add or adapt tests that prove:

- The contracts graph helpers and owner memory backend preserve expansion, relation-strength,
  node lookup, local expansion, and projection delegation behavior.
- Host-local constructs the memory backend from `service-knowledge-read` and
  has no server graph-query import.
- Server Neo4j and fail-open paths still satisfy the canonical contracts port.
- The import-boundary guard rejects a restored host-local server graph-query
  import and the owner package has no server import.

Required validation after implementation:

```bash
rtk pnpm --filter @trapmap/contracts test --run src/domain/graph-query.test.ts
rtk pnpm --filter @trapmap/service-knowledge-read test
rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/import-boundary.test.ts
rtk pnpm --filter @trapmap/server test --run src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts
rtk pnpm typecheck
rtk pnpm exec fallow audit --base main --format json --quiet 2>/dev/null || true
```

The Fallow report must have zero introduced graph-query boundary violations,
dead exports, dependency findings, duplication, and complexity. An unrelated
inherited full-branch finding is not evidence that this tranche failed, but it
must not be suppressed by this migration.

## Documentation And Completion Evidence

The compatibility-retirement detail must record the exact implementation,
test, typecheck, and architecture-boundary evidence. The Wave 8 allowlist is
updated only for the removed host-local graph-query import. It remains open
until all of its host/gateway/server compatibility entries are removed and its
broader acceptance evidence is complete.

No public API, environment variable, or deployment default changes in this
tranche require an operations-document update. The active retirement detail is
the required factual record.
