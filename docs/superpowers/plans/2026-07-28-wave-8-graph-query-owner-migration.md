# Wave 8 Graph Query Owner Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@trapmap/service-knowledge-read` own the memory graph-query implementation and remove host-local's remaining server graph-query dependency.

**Architecture:** Extract the graph-query contract, memory backend, graphology algorithms, and boundary-node normalizers into `service-knowledge-read`. Server consumes that shared owner API while retaining only Graph DB configuration, Neo4j projection/client behavior, and the fail-open wrapper. Host-local composes its memory backend directly from the owner package.

**Tech Stack:** TypeScript 5.9, Vitest 3, pnpm workspaces, Graphology, PostgreSQL owner ports, Fallow.

## Global Constraints

- `service-knowledge-read` must not import `@trapmap/server` or `@trapmap/runtime-infra`.
- `host-local` must not import any `@trapmap/server/lib/graph-query/*` module.
- Do not leave a server re-export, duplicate memory backend, dual runtime path, or compatibility fallback after Task 2. Task 1 may add the owner implementation before Task 2 deletes the server implementation; the temporary duplicate is not a deployable completion state and no host-local consumer may be switched before the deletion.
- The canonical `GraphQueryBackend` retains its complete current surface, including projection writes, health, bounded expansion, and mitigating-skill lookup.
- Host-local retains `{ backendKind: 'memory', mode: 'disabled', failOpen: true }`; server retains its existing Neo4j fail-open/fail-closed policy.
- Preserve GraphIndexRepositoryPort as the canonical source; do not introduce snapshot or in-memory compatibility state.
- Stage only task files; do not stage `.superpowers/sdd/*` workflow artifacts.
- Run `pnpm exec fallow audit --base main --format json --quiet 2>/dev/null || true` after the migration and investigate introduced findings without suppressing inherited ones.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/service-knowledge-read/src/graph-query.ts` | Canonical backend contract and memory backend using GraphIndexRepositoryPort. |
| `packages/service-knowledge-read/src/graphology.ts` | Graph construction, runtime snapshots, cycle validation, bounded expansion, and graph query helpers. |
| `packages/service-knowledge-read/src/boundary-normalize.ts` | Shared boundary node identifiers and normalization used by graph algorithms and server indexers. |
| `packages/service-knowledge-read/src/graph-query.test.ts` | Owner-package memory backend behavior and delegation tests. |
| `packages/service-knowledge-read/src/index.ts` | Public owner-package exports for the graph API. |
| `packages/service-knowledge-read/package.json` | Direct Graphology dependencies. |
| `packages/server/src/lib/graph-query/{config,health,index,neo4j-backend}.ts` | Server-only configuration, health, and Neo4j behavior rewritten against owner types. |
| `packages/server/src/lib/indexing/**` and `packages/server/src/lib/retrieval/**` | Server consumers switched to direct owner-package imports. |
| `packages/host-local/src/nest/runtime/shared-infra.ts` | Host composition switched to direct owner-package memory backend import. |
| import-boundary tests and retirement detail | Enforce no reversed imports and record factual Wave 8 evidence. |

### Task 1: Establish the Owner Graph Core

**Files:**
- Create: `packages/service-knowledge-read/src/graph-query.ts`
- Create: `packages/service-knowledge-read/src/graph-query.test.ts`
- Create: `packages/service-knowledge-read/src/graphology.ts`
- Create: `packages/service-knowledge-read/src/boundary-normalize.ts`
- Modify: `packages/service-knowledge-read/src/context.ts`
- Modify: `packages/service-knowledge-read/src/index.ts`
- Modify: `packages/service-knowledge-read/package.json`
- Modify: `pnpm-lock.yaml`
- Test: `packages/service-knowledge-read/src/graph-query.test.ts`

**Interfaces:**
- Consumes: `GraphIndexRepositoryPort`, `GraphIndexDocumentRecord`, `GraphNodeRecord`, and graph edge types from `@trapmap/contracts`.
- Produces: `GraphQueryBackend`, `GraphQueryBackendHealth`, `GraphQueryRuntimeState`, `GraphQueryExpansionView`, `createMemoryGraphQueryBackend`, `buildGraphRuntimeSnapshot`, `buildLocalExpansionView`, and boundary normalization helpers from `@trapmap/service-knowledge-read`.
- Replaces: the duplicate `KnowledgeReadGraphQueryBackend` and `KnowledgeReadGraphQueryRuntimeState` declarations with aliases to the canonical types.

- [ ] **Step 1: Write failing owner-backend tests**

Create `graph-query.test.ts` with a repository fake whose methods are `listAll`, `upsert`, and `removeBySource`. Test that `createMemoryGraphQueryBackend(repo)`:

```ts
const backend = createMemoryGraphQueryBackend(repo);
expect(backend.getRuntimeState()).toEqual({
  backendKind: 'memory',
  failOpen: false,
  mode: 'disabled',
});
await backend.upsertDocument(document);
expect(repo.upsert).toHaveBeenCalledWith(document);
await backend.removeSource('skill', 'skill-1');
expect(repo.removeBySource).toHaveBeenCalledWith('skill', 'skill-1');
```

Add fixtures containing a `trap:t1` node, a connected `skill:s1` node, and a
`mitigates` edge. Assert one-hop expansion, relation strength, source node IDs,
bounded expansion view ownership, and `findMitigatingSkills` against that
fixture. Assert `rebuildProjection` does not write the repository.

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm --filter @trapmap/service-knowledge-read test --run src/graph-query.test.ts
```

Expected: FAIL because `./graph-query.js` and its public exports do not exist.

- [ ] **Step 3: Move the complete canonical contract and memory implementation**

Create `graph-query.ts` with the complete server backend surface:

```ts
export interface GraphQueryBackend {
  readonly kind: GraphQueryBackendKind;
  isEnabled(): boolean;
  getRuntimeState(): GraphQueryRuntimeState;
  healthcheck(): Promise<GraphQueryBackendHealth>;
  upsertDocument(document: GraphIndexDocumentRecord): Promise<void>;
  removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void>;
  rebuildProjection(documents: GraphIndexDocumentRecord[]): Promise<void>;
  expandSourcesOneHop(params: { queryLabels: Set<string>; eligibleSourceIds?: Set<string> }): Promise<Set<string>>;
  calculateSourceRelationStrength(params: { sourceId: string; queryLabels: Set<string> }): Promise<number>;
  getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>>;
  buildLocalExpansionView(params: { seedNodeIds: string[]; maxDepth: number; auth: { teamId: string | null; securityLevel: number } }): Promise<GraphQueryExpansionView>;
  findMitigatingSkills(trapNodeIds: string[]): Promise<string[]>;
}
```

Port the current server memory backend without semantic changes. It must load
documents from `graphIndexRepo.listAll()` for read operations, delegate write
operations to the port, and use the owner-local graphology helpers.

Port `graphology.ts` from `packages/server/src/lib/indexing/graph-lite/graphology.ts`,
but import graph document types directly from `@trapmap/contracts` and
`buildContextNodeId` from `./boundary-normalize.js`. Port every exported helper:
`buildGraphFromDocuments`, `buildGraphRuntimeSnapshot`, `expandSourcesOneHop`,
`calculateSourceRelationStrength`, `projectHardDependencyGraph`,
`assertNoHardDependencyCycles`, `buildLocalExpansionView`,
`findEntriesByContext`, and `findEntriesByBoundaryConstraints`.

Port all of `boundary-normalize.ts` unchanged in behavior. Change
`context.ts` declarations to:

```ts
import type { GraphQueryBackend, GraphQueryRuntimeState } from './graph-query.js';

export type KnowledgeReadGraphQueryBackend = GraphQueryBackend;
export type KnowledgeReadGraphQueryRuntimeState = GraphQueryRuntimeState;
```

Export the canonical types/functions from `src/index.ts`. Add
`graphology`, `graphology-dag`, `graphology-operators`, and
`graphology-shortest-path` as direct dependencies, then regenerate the lockfile
using pnpm's existing workspace configuration.

- [ ] **Step 4: Run owner tests and typecheck**

Run:

```bash
pnpm --filter @trapmap/service-knowledge-read test --run src/graph-query.test.ts
pnpm --filter @trapmap/service-knowledge-read typecheck
```

Expected: both commands pass; tests prove the memory backend's behavior without
any server import.

- [ ] **Step 5: Commit the owner graph core**

```bash
git add packages/service-knowledge-read/src/graph-query.ts packages/service-knowledge-read/src/graph-query.test.ts packages/service-knowledge-read/src/graphology.ts packages/service-knowledge-read/src/boundary-normalize.ts packages/service-knowledge-read/src/context.ts packages/service-knowledge-read/src/index.ts packages/service-knowledge-read/package.json pnpm-lock.yaml
git commit -m "feat: move memory graph query to knowledge read"
```

### Task 2: Adapt Server to the Canonical Owner API

**Files:**
- Delete: `packages/server/src/lib/graph-query/backend.ts`
- Delete: `packages/server/src/lib/graph-query/memory-backend.ts`
- Delete: `packages/server/src/lib/indexing/graph-lite/graphology.ts`
- Modify: `packages/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/server/src/lib/graph-query/config.ts`
- Modify: `packages/server/src/lib/graph-query/health.ts`
- Modify: `packages/server/src/lib/graph-query/index.ts`
- Modify: `packages/server/src/lib/graph-query/neo4j-backend.ts`
- Modify: `packages/server/src/lib/graph-query/{health,neo4j-backend,projector}.test.ts`
- Modify: `packages/server/src/app.ts`, `packages/server/src/lib/context.ts`, and `packages/server/src/lib/runtime/runtime-metadata.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-repositories.ts`
- Modify: `packages/server/src/lib/{indexing,retrieval,labels}/**/*.ts` that import either removed module or `graph-lite` graphology exports
- Test: `packages/server/src/lib/graph-query/health.test.ts`
- Test: `packages/server/src/lib/graph-query/neo4j-backend.test.ts`
- Test: `packages/server/src/lib/indexing/graph-lite/graphology.test.ts`

**Interfaces:**
- Consumes: all Task 1 exports from `@trapmap/service-knowledge-read`.
- Produces: server Neo4j and fail-open behavior implementing `GraphQueryBackend` with unchanged server configuration semantics.
- Removes: server-owned graph backend contract, memory factory, and graphology implementation.

- [ ] **Step 1: Make server tests fail against the intended public owner imports**

Change the server graph-query tests to import their contract from
`@trapmap/service-knowledge-read`; add a compile-time assignment for
`Neo4jGraphQueryBackend` to `GraphQueryBackend`:

```ts
const backend: GraphQueryBackend = new Neo4jGraphQueryBackend(repo, client);
expect(backend.kind).toBe('neo4j');
```

Move the existing graphology behavioral test to use owner exports and replace
its server fixture import with local document builders so it cannot conceal a
reverse package dependency.

- [ ] **Step 2: Run the affected tests to verify missing owner exports fail**

Run:

```bash
pnpm --filter @trapmap/server test --run src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts src/lib/indexing/graph-lite/graphology.test.ts
```

Expected: FAIL until the server consumers use Task 1's owner API and the old
server-local definitions are removed.

- [ ] **Step 3: Replace every server implementation import with direct owner imports**

Add `@trapmap/service-knowledge-read: "workspace:*"` to the server manifest.
Update the listed server graph-query files so:

```ts
import type {
  GraphQueryBackend,
  GraphQueryBackendHealth,
  GraphQueryRuntimeState,
} from '@trapmap/service-knowledge-read';
```

is used by configuration, health, Neo4j, app context, runtime metadata,
indexing, lifecycle, jobs, retrieval channels, graph plans, and capsule graph
code. Import `createMemoryGraphQueryBackend` directly from the owner package in
bootstrap and the server retrieval code paths that construct an implicit memory
backend. Import graphology and boundary-normalization helpers directly from the
owner package in server indexing, retrieval scoring/planning, labels, and
projector code.

Keep `graph-query/index.ts` limited to server-only config, Neo4j, projection,
and health exports. Do not re-export owner contract types or the memory factory.
Delete the old `backend.ts`, `memory-backend.ts`, and server graphology source.
Remove the four Graphology dependencies from the server manifest only after
searching that no remaining server file imports them directly. Regenerate the
lockfile.

- [ ] **Step 4: Verify server behavior and absence of stale internal imports**

Run:

```bash
pnpm --filter @trapmap/server test --run src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts src/lib/indexing/graph-lite/graphology.test.ts
rg -n "graph-query/(backend|memory-backend)|graph-lite/graphology" packages/server/src --glob '*.ts'
pnpm --filter @trapmap/server typecheck
```

Expected: tests and typecheck pass. The search returns no production reference
to either deleted implementation path; test descriptions may still contain the
term `graphology` but may not import a deleted server source.

- [ ] **Step 5: Commit the server adaptation**

```bash
git add packages/server/package.json pnpm-lock.yaml packages/server/src
git commit -m "refactor: consume owner graph query core"
```

### Task 3: Cut Host-Local Over and Record Wave 8 Evidence

**Files:**
- Modify: `packages/host-local/src/nest/runtime/shared-infra.ts`
- Modify: `packages/host-local/src/nest/runtime/import-boundary.test.ts`
- Modify: `packages/service-knowledge-read/src/import-boundary.test.ts`
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts`
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`
- Test: `packages/host-local/src/nest/runtime/import-boundary.test.ts`
- Test: `packages/service-knowledge-read/src/import-boundary.test.ts`

**Interfaces:**
- Consumes: `createMemoryGraphQueryBackend`, `GraphQueryBackend`, and `GraphQueryRuntimeState` from Task 1.
- Produces: a host-local composition path with no server graph-query import and factual active-plan evidence.
- Removes: the Wave 8 graph-query allowlist entry only if the guard describes that exact old import.

- [ ] **Step 1: Strengthen the import-boundary tests first**

In the host-local import-boundary test, add assertions that
`shared-infra.ts` contains the owner-package import and contains neither
`@trapmap/server/lib/graph-query/index.js` nor any server graph-query subpath.
In the knowledge-read boundary test, add the owner graph files to the explicit
business-source coverage and assert they are free of `@trapmap/server` imports.

- [ ] **Step 2: Run boundary tests to verify the host path still fails**

Run:

```bash
pnpm --filter @trapmap/host-local test --run src/nest/runtime/import-boundary.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run src/import-boundary.test.ts
```

Expected: host-local test FAILS while `shared-infra.ts` imports the server
barrel; knowledge-read test passes once Task 1 is complete.

- [ ] **Step 3: Switch host composition and remove only the exact retirement exception**

Replace the graph-query import in `shared-infra.ts` with the root owner package:

```ts
import {
  createKnowledgeReadGraphIndexRepository,
  createMemoryGraphQueryBackend,
  type GraphQueryBackend,
  type GraphQueryRuntimeState,
} from '@trapmap/service-knowledge-read';
```

Keep the existing PostgreSQL fail-fast guard and literal host-local runtime
metadata unchanged. Remove only the matching graph-query host exception from
`compatibility-retirement-guard.test.ts`; do not mark Wave 8 complete. Append a
factual Wave 8 follow-up to the active retirement detail with the final command
counts and any remaining Wave 8 allowlist entries.

- [ ] **Step 4: Run focused checks, repository typecheck, and architecture audit**

Run:

```bash
pnpm --filter @trapmap/host-local test --run src/nest/runtime/import-boundary.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run src/import-boundary.test.ts src/graph-query.test.ts
pnpm --filter @trapmap/server test --run src/lib/graph-query/health.test.ts src/lib/graph-query/neo4j-backend.test.ts src/lib/indexing/graph-lite/graphology.test.ts
pnpm typecheck
pnpm exec fallow audit --base main --format json --quiet 2>/dev/null || true
pnpm check:docs-drift
pnpm check:structure
```

Expected: focused tests, typecheck, docs-drift, and structure pass. Inspect the
Fallow JSON and resolve every introduced provider-surface boundary, dependency,
dead-code, duplication, or complexity finding; report inherited branch-wide
findings separately rather than suppressing them.

- [ ] **Step 5: Commit the host cutover and evidence**

```bash
git add packages/host-local/src/nest/runtime/shared-infra.ts packages/host-local/src/nest/runtime/import-boundary.test.ts packages/service-knowledge-read/src/import-boundary.test.ts scripts/__tests__/compatibility-retirement-guard.test.ts docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md
git commit -m "refactor: move host graph query to knowledge read"
```

## Final Review Checklist

- [ ] `rg` finds no host-local production import of `@trapmap/server/lib/graph-query`.
- [ ] `service-knowledge-read` graph-query source has no server import.
- [ ] Server Neo4j and fail-open modules use the canonical owner contract without re-exporting it.
- [ ] The server retains Graph DB configuration and fail-open policy unchanged.
- [ ] The owner memory backend reads/writes only through GraphIndexRepositoryPort.
- [ ] The active retirement detail documents evidence but keeps Wave 8 open unless every Wave 8 allowance is gone.
