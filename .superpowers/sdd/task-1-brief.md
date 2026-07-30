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
rtk pnpm --filter @trapmap/service-knowledge-read test --run src/graph-query.test.ts
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
rtk pnpm --filter @trapmap/service-knowledge-read test --run src/graph-query.test.ts
rtk pnpm --filter @trapmap/service-knowledge-read typecheck
```

Expected: both commands pass; tests prove the memory backend's behavior without
any server import.

- [ ] **Step 5: Commit the owner graph core**

```bash
rtk git add packages/service-knowledge-read/src/graph-query.ts packages/service-knowledge-read/src/graph-query.test.ts packages/service-knowledge-read/src/graphology.ts packages/service-knowledge-read/src/boundary-normalize.ts packages/service-knowledge-read/src/context.ts packages/service-knowledge-read/src/index.ts packages/service-knowledge-read/package.json pnpm-lock.yaml
rtk git commit -m "feat: move memory graph query to knowledge read"
```

