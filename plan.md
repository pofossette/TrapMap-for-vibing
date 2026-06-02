# Optional Graph Database for TrapMap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `graph_index_documents` as the durable truth and add an environment-variable-controlled optional graph database query backend that removes full-table graph rebuilds from hot query paths.

> Historical note: the "Current-State Analysis" section below describes the pre-implementation baseline captured when this plan was written. Later phases in this same file record the implemented replacement path.

**Architecture:** TrapMap already persists graph documents in PostgreSQL, but retrieval still calls `graphIndex.listAll()` and rebuilds a `graphology` runtime graph per query. The new design keeps PostgreSQL graph documents as the canonical derived index, adds a projection/sync layer into Neo4j, and routes query-time graph expansion through either the existing in-memory backend or the new Neo4j backend depending on env config. The query semantics should also borrow LightRAG’s split between local graph neighborhood lookup and mixed graph+vector retrieval rather than making graph traversal the only recall path.

**Tech Stack:** TypeScript, Fastify, Drizzle/pg, `graphology`, optional `neo4j-driver`, Vitest, retrieval eval runners.

---

## Current-State Analysis

### What the code does today

- `packages/server/src/lib/graph-index/repository.ts`
  - `PgGraphIndexRepository.listAll()` loads every row from `graph_index_documents`.
  - `nodes` and `edges` are still JSONB arrays inside each document row.
- `packages/server/src/lib/retrieval/recall/graph-assisted.ts`
  - every recall request does `graphIndexRepo.listAll()`
  - then `buildGraphRuntimeSnapshot(graphDocuments)`
  - then `expandSourcesOneHop()` and `calculateSourceRelationStrength()`
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
  - every plan compile does `services.repos.graphIndex.listAll()`
  - then `buildGraphRuntimeSnapshot(graphDocs)`
  - then `buildLocalExpansionView({ documents, seedNodeIds, maxDepth })`
- `packages/server/src/lib/indexing/graph-lite/graphology.ts`
  - `buildGraphFromDocuments()` iterates all docs, all nodes, and all edges into a fresh in-memory directed multigraph.
  - `buildLocalExpansionView()` rebuilds the full graph again before extracting the reachable subgraph.

### Why this is the bottleneck

- PostgreSQL currently stores graph documents, not queryable graph adjacency.
- Query APIs expose only `listAll()` semantics instead of neighborhood/path expansion semantics.
- Hot-path graph queries pay three costs repeatedly:
  - full-table read from `graph_index_documents`
  - JSONB decode of all nodes/edges
  - full `graphology` rebuild before a bounded traversal
- This design is acceptable for low-volume or test fixtures, but it scales poorly as graph docs grow.

### Constraints the new design must preserve

- PostgreSQL `graph_index_documents` remains the source of truth and fallback path.
- Governance filtering must stay enforced before results leave the retrieval layer.
- Existing GraphRAG-lite document builders and cycle validation remain valid.
- JSON/file mode and test fixtures must still work when the graph database is disabled.

## Database Choice

### Chosen database: Neo4j

- Reason 1: the official Neo4j JavaScript driver is current and directly supports Node/TypeScript integration over Bolt.
- Reason 2: Neo4j gives first-class graph traversal, pattern matching, and indexing through Cypher instead of forcing TrapMap to deserialize JSONB docs and rebuild adjacency in application memory.
- Reason 3: Neo4j has an official Docker deployment path, which fits TrapMap’s existing local-dev posture.
- Reason 4: LightRAG already exposes `Neo4JStorage` as a supported graph backend and describes `mix` mode as combining knowledge graph and vector retrieval. That matches TrapMap’s need better than a graph-only rewrite.

### Why not Apache AGE first

- AGE keeps everything inside PostgreSQL, which is attractive operationally, but it does not cleanly separate TrapMap’s durable graph-document storage from its query graph engine.
- It also keeps this work coupled to PG-specific extension management instead of giving a clearly optional backend.
- For this task, the larger win is a dedicated traversal engine behind a feature flag, not “more graph features inside the same database.”

### Why not Memgraph first

- Memgraph is viable, but Neo4j has a more established Node.js integration surface and a clearer reference path for graph-backed RAG patterns in the current ecosystem.
- Choosing Neo4j also makes LightRAG-inspired operator patterns easier to compare directly.

## External Reference Notes

- LightRAG core documents `graph_storage` choices including `NetworkXStorage`, `Neo4JStorage`, `PGGraphStorage`, and `AGEStorage`.
- LightRAG query modes include:
  - `local`: context-dependent neighborhood retrieval
  - `global`: broader graph knowledge retrieval
  - `hybrid`: combines local and global
  - `mix`: combines knowledge graph and vector retrieval
- For TrapMap, the useful reference is architectural, not literal:
  - keep graph storage pluggable
  - keep graph retrieval modes distinct from vector/text retrieval
  - prefer mixed retrieval over “always traverse the whole graph”

## Proposed Runtime Contract

### Environment variables

- `TRAPMAP_GRAPH_DB_ENABLED=false`
  - master switch; when `false`, TrapMap uses the current in-memory `graphology` path
- `TRAPMAP_GRAPH_DB_PROVIDER=neo4j`
  - reserved enum for future backends; only honored when enabled
- `TRAPMAP_GRAPH_DB_URI=bolt://127.0.0.1:7687`
- `TRAPMAP_GRAPH_DB_USERNAME=neo4j`
- `TRAPMAP_GRAPH_DB_PASSWORD=...`
- `TRAPMAP_GRAPH_DB_DATABASE=neo4j`
- `TRAPMAP_GRAPH_DB_FAIL_OPEN=true`
  - when Neo4j is unavailable, log and fall back to in-memory traversal instead of failing the request
- `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true`
  - controls whether graph document writes also sync the Neo4j projection immediately

### Behavioral contract

- disabled:
  - query path uses existing `graphology` runtime assembly
- enabled + healthy:
  - query path uses Neo4j neighborhood/path queries
- enabled + unhealthy + `FAIL_OPEN=true`:
  - query path falls back to in-memory graphology and emits structured diagnostics
- enabled + unhealthy + `FAIL_OPEN=false`:
  - startup or request path fails fast, depending on component

## File Structure

### New files

- `packages/server/src/lib/graph-query/backend.ts`
  - backend interface for query-time graph operations
- `packages/server/src/lib/graph-query/memory-backend.ts`
  - wraps current `graphology`-based logic behind the new interface
- `packages/server/src/lib/graph-query/neo4j-backend.ts`
  - Neo4j implementation for expansion, relation scoring, mitigation lookup, and subgraph fetch
- `packages/server/src/lib/graph-query/projector.ts`
  - converts `GraphIndexDocumentRecord` to graph-db node/relationship upserts
- `packages/server/src/lib/graph-query/config.ts`
  - env parsing and validation specific to graph DB
- `packages/server/src/lib/graph-query/health.ts`
  - healthcheck and fallback helpers
- `packages/server/src/lib/graph-query/neo4j-backend.test.ts`
- `packages/server/src/lib/graph-query/projector.test.ts`

### Modified files

- `packages/server/src/config.ts`
  - add env parsing for graph DB options
- `packages/server/src/config.test.ts`
- `packages/server/src/lib/repos/index.ts`
  - construct graph query backend alongside existing repos
- `packages/server/src/lib/context.ts`
  - expose the chosen graph query backend to retrieval code
- `packages/server/src/lib/retrieval/recall/graph-assisted.ts`
  - replace direct `listAll()` + runtime rebuild with backend calls
- `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
  - replace direct `listAll()` + local expansion rebuild with backend calls
- `packages/server/src/lib/indexing/adapters/graph.ts`
- `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
- `packages/server/src/lib/indexing/reconcile.ts`
  - sync/remove/backfill projection in Neo4j
- `packages/server/src/bootstrap/bootstrap-repositories.ts`
  - wire health/logging and channel registration
- `docs/operations/ENVIRONMENT.md`
- `docs/operations/TESTING.md`
- `docs/architecture/components/RETRIEVAL.md`
- `docs/architecture/PRECOMPUTATION.md`
- `docs/guides/PG_AND_GRAPHOLOGY.md`
- `docs/reference/DATA_MODEL.md`
- `docs/reference/DATABASE_SCHEMA.md`
  - only if we add PG metadata tables for graph sync state or checkpoints

## Example Structure and Code

### Example backend interface

```ts
export interface GraphQueryBackend {
  kind: 'memory' | 'neo4j';
  isEnabled(): boolean;
  healthcheck(): Promise<{ ok: boolean; mode: 'primary' | 'fallback'; detail?: string }>;
  upsertDocument(document: GraphIndexDocumentRecord): Promise<void>;
  removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void>;
  expandSourcesOneHop(params: {
    queryLabels: Set<string>;
    eligibleSourceIds?: Set<string>;
  }): Promise<Set<string>>;
  calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number>;
  buildLocalExpansionView(params: {
    seedNodeIds: string[];
    maxDepth: number;
    auth: { teamId: string | null; securityLevel: number };
  }): Promise<GraphExpansionView>;
  findMitigatingSkills(trapNodeIds: string[]): Promise<string[]>;
}
```

### Example config shape

```ts
const GraphDbConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['neo4j']).default('neo4j'),
  uri: z.string().url().nullable(),
  username: z.string().min(1).nullable(),
  password: z.string().min(1).nullable(),
  database: z.string().min(1).default('neo4j'),
  failOpen: z.boolean().default(true),
  syncOnWrite: z.boolean().default(true),
});
```

### Example projector query

```cypher
MERGE (s:Source {sourceId: $sourceId, sourceType: $sourceType})
SET s.scope = $scope,
    s.teamId = $teamId,
    s.requiredLevel = $requiredLevel,
    s.revision = $revision,
    s.contentHash = $contentHash

WITH s
UNWIND $nodes AS node
MERGE (n:GraphNode {id: node.id})
SET n.kind = node.kind,
    n.label = node.label,
    n.evidence = node.evidence
MERGE (s)-[:CONTAINS]->(n)

WITH s
UNWIND $edges AS edge
MATCH (src:GraphNode {id: edge.sourceNodeId})
MATCH (dst:GraphNode {id: edge.targetNodeId})
MERGE (src)-[r:REL {id: edge.id}]->(dst)
SET r.relationType = edge.relationType,
    r.strength = edge.strength,
    r.evidence = edge.evidence,
    r.sourceId = $sourceId
```

### Example LightRAG-inspired retrieval split

```ts
const graphCandidates =
  queryMode === 'graph-assisted'
    ? await graphBackend.expandSourcesOneHop({ queryLabels, eligibleSourceIds })
    : new Set<string>();

const mixedCandidates = mergeGraphAndVectorCandidates({
  graphCandidates,
  semanticCandidates,
  mode: 'mix',
});
```

## Phase 1: Lock the Contract and Add the Feature Flag

**Files:**
- Create: `packages/server/src/lib/graph-query/backend.ts`
- Create: `packages/server/src/lib/graph-query/config.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/config.test.ts`
- Modify: `packages/server/src/lib/context.ts`

- [x] Define the backend interface and graph DB config schema.
- [x] Parse `TRAPMAP_GRAPH_DB_*` env vars in server config with sane defaults.
- [x] Add bootstrap wiring so services know whether graph DB is disabled, enabled-primary, or enabled-fallback.
- [x] Keep default behavior unchanged when env vars are absent.

**Completion standard**

- [x] Starting the server with no graph DB env vars behaves exactly like today.
- [x] Invalid graph DB env combinations fail validation clearly.
- [x] A single runtime object describes the selected graph query mode.

**Docs updates**

- [x] `docs/operations/ENVIRONMENT.md` documents every new env var and fallback rule.
- [x] `docs/architecture/ARCHITECTURE.md` or `docs/architecture/components/RETRIEVAL.md` explains that graph DB is optional and PG graph documents remain canonical.

**Tests / eval updates**

- [x] Add config tests covering disabled, enabled-valid, enabled-invalid, and fail-open combinations.
- [x] Run `rtk pnpm test -- --run packages/server/src/config.test.ts`.
- [x] Run `rtk pnpm typecheck`.

## Phase 2: Wrap Existing Graphology Logic Behind a Query Backend

**Files:**
- Create: `packages/server/src/lib/graph-query/memory-backend.ts`
- Modify: `packages/server/src/lib/retrieval/recall/graph-assisted.ts`
- Modify: `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-repositories.ts`
- Test: `packages/server/src/lib/retrieval/recall/graph-assisted.test.ts`
- Test: `packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts`

- [x] Move existing `graphology` traversal behavior behind `GraphQueryBackend`.
- [x] Make graph-assisted recall call backend methods instead of `graphIndexRepo.listAll()`.
- [x] Make plan-compiler call backend methods instead of rebuilding the graph directly.
- [x] Preserve existing semantics and test expectations.

**Completion standard**

- [x] Retrieval tests still pass with backend kind `memory`.
- [x] No hot-path retrieval module directly calls `graphIndexRepo.listAll()` for traversal anymore.
- [x] Graph traversal behavior is now swappable without touching retrieval orchestration again.

**Docs updates**

- [x] `docs/architecture/components/RETRIEVAL.md` updates the query path diagram to reference `GraphQueryBackend`.
- [x] `docs/guides/PG_AND_GRAPHOLOGY.md` explains that graphology is now the fallback/query-backend implementation, not the only path.

**Tests / eval updates**

- [x] Update unit tests to use backend doubles instead of raw graph document arrays where appropriate.
- [x] Run `rtk pnpm test -- --run packages/server/src/lib/retrieval/recall/graph-assisted.test.ts packages/server/src/lib/retrieval/graph-plan/plan-compiler.test.ts packages/server/src/__tests__/lib/retrieval/capsule-graph-channel.test.ts`.
- [x] Run `rtk pnpm eval:retrieval:smoke`.

## Phase 3: Add Neo4j Projection and Sync

**Files:**
- Create: `packages/server/src/lib/graph-query/neo4j-backend.ts`
- Create: `packages/server/src/lib/graph-query/projector.ts`
- Create: `packages/server/src/lib/graph-query/health.ts`
- Modify: `packages/server/src/lib/indexing/adapters/graph.ts`
- Modify: `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
- Modify: `packages/server/src/lib/indexing/reconcile.ts`
- Modify: `packages/server/src/lib/repos/index.ts`
- Test: `packages/server/src/lib/graph-query/projector.test.ts`
- Test: `packages/server/src/lib/graph-query/neo4j-backend.test.ts`

- [x] Add a Neo4j-backed implementation for one-hop expansion, relation-strength lookup, mitigation lookup, and bounded local subgraph fetch.
- [x] Build a projector that maps each `GraphIndexDocumentRecord` into Neo4j source/node/relationship data.
- [x] Sync Neo4j on upsert/remove paths when `TRAPMAP_GRAPH_DB_SYNC_ON_WRITE=true`.
- [x] Add a reconciliation/backfill path so Neo4j can be rebuilt from PostgreSQL truth.
- [x] Ensure `FAIL_OPEN=true` falls back cleanly to memory backend.

**Completion standard**

- [x] Enabling Neo4j does not change source-of-truth ownership; PostgreSQL still reconstructs the projection.
- [x] Disabling Neo4j removes all operational dependency on Neo4j.
- [x] Reconcile/backfill can rebuild the graph projection from `graph_index_documents` deterministically.
- [x] A temporary Neo4j outage does not leak incorrect results or bypass governance.

**Docs updates**

- [x] `docs/architecture/PRECOMPUTATION.md` documents PG truth -> Neo4j projection flow.
- [x] `docs/reference/DATA_MODEL.md` documents the split between durable graph documents and optional graph query store.
- [x] `docs/reference/DATABASE_SCHEMA.md` is updated only if this phase adds PG-side sync metadata/checkpoint tables.

Verified on 2026-06-02: this graph DB phase did not add any PostgreSQL-side sync metadata or checkpoint tables beyond the existing `graph_index_documents` truth store, so no `DATABASE_SCHEMA.md` change was required.

**Tests / eval updates**

- [x] Add projector tests for trap docs, skill docs, upsert overwrite, and delete.
- [x] Add Neo4j integration tests gated by graph DB env vars; skip when not configured.
- [x] Extend reconcile tests to prove PG truth can rehydrate Neo4j.
- [x] Run targeted tests for indexing and sync paths.

**Suggested commands**

```bash
rtk pnpm test -- --run \
  packages/server/src/lib/graph-query/projector.test.ts \
  packages/server/src/lib/graph-query/neo4j-backend.test.ts \
  packages/server/src/lib/indexing/adapters/graph.test.ts \
  packages/server/src/lib/indexing/adapters/artifact-graph.test.ts \
  packages/server/src/lib/indexing/reconcile.test.ts
```

## Phase 4: Apply LightRAG-Inspired Retrieval Semantics

**Files:**
- Modify: `packages/server/src/lib/retrieval/recall/graph-assisted.ts`
- Modify: `packages/server/src/lib/retrieval/orchestration/recall-coordinator.ts`
- Modify: `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts`
- Modify: `evals/retrieval/**`
- Modify: `evals/codex-eval-smoke.json`

- [x] Keep current `graph-assisted` behavior as the local-neighborhood retrieval mode.
- [x] Add explicit mixed-retrieval semantics in orchestration, where graph candidates and semantic/vector candidates are merged deliberately.
- [x] Avoid turning Neo4j into a replacement for semantic retrieval; it should supply structural recall, not own the whole retrieval decision.
- [x] Evaluate whether plan compilation should use:
  - local subgraph only for seed neighborhoods
  - optional broader/global graph lookup for mitigation ranking

Decision: keep plan compilation on local subgraph only in this phase; do not introduce broader/global graph lookup for mitigation ranking yet.

**Completion standard**

- [x] Graph DB improves traversal efficiency without changing retrieval philosophy into graph-only search.
- [x] Retrieval traces can explain whether candidates came from local graph expansion, mixed recall, or fallback memory mode.
- [x] LightRAG-inspired “mix” behavior is reflected in naming or trace metadata, not left implicit.

**Docs updates**

- [x] `docs/architecture/components/RETRIEVAL.md` describes local vs mixed graph retrieval.
- [x] `docs/operations/TESTING.md` adds required verification for graph DB enabled vs disabled runs.

**Tests / eval updates**

- [x] Add regression tests proving mixed retrieval still intersects with governance-eligible entries only.
- [x] Add smoke eval cases for:
  - graph DB disabled baseline
  - graph DB enabled local graph hit
  - mixed recall improves over vector-only for a graph-linked query
  - fallback-to-memory when graph DB is unavailable
- [x] Run `rtk pnpm eval:smoke`.
- [x] Run `rtk pnpm eval:retrieval:smoke`.

Observed on 2026-06-01: `eval:smoke` and `eval:retrieval:smoke` both ran successfully through the retrieval suite, but the suite still reports 2 pre-existing keyword smoke failures (`v2-keyword-dominant-smoke`, `v2-keyword-regex-smoke`) unrelated to Phase 4 graph changes.

## Phase 5: Operability, Benchmarks, and Rollout

**Files:**
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/reference/PERFORMANCE.md`
- Modify: `docs/operations/TROUBLESHOOTING.md` or nearest equivalent
- Create or modify: graph health/benchmark script if needed under `packages/server/scripts/` or `scripts/`

- [x] Add healthcheck/diagnostic logging for graph backend selection and fallback.
- [x] Add a reproducible benchmark comparing:
  - memory backend
  - Neo4j backend
  - disabled vs enabled startup behavior
- [x] Document local Docker startup for Neo4j and how to run with the env flag enabled.
- [x] Decide rollout default:
  - conservative: disabled by default everywhere
  - later optional enablement in targeted environments

**Completion standard**

- [x] Operators can tell from logs and health output which backend is active.
- [x] Performance docs include before/after methodology, not just anecdotal claims.
- [x] Devs can run the feature locally from documentation without reading code.

**Docs updates**

- [x] `docs/architecture/DEPLOYMENT.md` adds optional Neo4j service wiring.
- [x] `docs/reference/PERFORMANCE.md` records benchmark method and expected win area.
- [x] `docs/operations/ENVIRONMENT.md` and troubleshooting docs cover common Neo4j failures.

**Tests / eval updates**

- [x] Add health/fallback tests.
- [x] Run `rtk pnpm check:docs-drift`.
- [x] Run `rtk pnpm check:mermaid` if diagrams change.
- [x] Run `rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`.

Observed on 2026-06-02: `check:docs-drift` passed. `docs-truth-smoke.test.ts` also passed when run via Vitest. No Mermaid source changed in this closeout pass, so no separate Mermaid check was required.

## Non-Goals

- [x] Do not move canonical graph truth out of PostgreSQL in this project.
- [x] Do not rewrite graph extraction, graph document shape, or governance rules in the same change.
- [x] Do not require Neo4j for test runs or local development by default.

## Final Acceptance Checklist

- [x] `graph-assisted.ts` and `plan-compiler.ts` no longer depend on full-table `listAll()` for their primary enabled path.
- [x] Neo4j can be turned on and off via environment variables only.
- [x] Disabled mode preserves today’s behavior and tests.
- [x] Enabled mode preserves correctness and governance while reducing query-time graph rebuild work.
- [x] Reconcile/backfill can restore the graph DB from PostgreSQL truth.
- [x] Retrieval evals explicitly cover graph-enabled, graph-disabled, and fallback paths.
- [x] All touched docs match the runtime truth.

Observed on 2026-06-02: `rtk pnpm eval:retrieval:smoke` was re-run during closeout and still reports the same 2 pre-existing keyword smoke failures (`v2-keyword-dominant-smoke`, `v2-keyword-regex-smoke`) already noted in Phase 4; graph-backend-specific smoke coverage remained intact.
