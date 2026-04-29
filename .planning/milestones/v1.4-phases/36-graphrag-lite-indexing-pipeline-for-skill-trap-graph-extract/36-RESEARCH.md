# Phase 36: GraphRAG-lite Indexing Pipeline for Skill-Trap Graph Extraction - Research

**Researched:** 2026-04-24 [VERIFIED: environment context]
**Domain:** Graph-backed lifecycle indexing for trap and skill retrieval inputs [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
**Confidence:** HIGH [VERIFIED: codebase grep][CITED: https://graphology.github.io/][CITED: https://arxiv.org/abs/2604.17870]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Working assumptions

- This project should borrow GraphRAG indexing ideas without importing an external GraphRAG runtime.
- The GraSP paper argues that the bottleneck has shifted from skill availability to skill orchestration, so indexing should optimize for later compilation quality rather than maximizing raw graph volume.
- Approved, retrievable content is the only content that should enter the graph index.
- Assets and script bodies should remain activation-only and must not be indexed as graph content.
- The graph extractor should move away from generic entity extraction toward TrapMap-specific semantics such as trap triggers, mitigations, prerequisites, and tool/path/environment cues.

### Target direction

- Keep the existing adapter-based indexing shape and extend it to cover skill artifacts rather than replacing it.
- Treat derived skill capsules as the primary skill-side indexing unit because they already provide distilled `situation`, `problem`, and `goal` text.
- Persist enough graph state to support deterministic query-time expansion without rebuilding the graph from scratch on every request.
- Favor a small typed relation set that the later compiler can trust: `mitigates`, `requires`, `order`, `risk-blocks`, and `co-occurs-with`.
- GraSP uses `state`, `data`, and `order` edges in its executable DAG. TrapMap does not need to mirror that schema literally, but the indexing layer should preserve enough evidence to map later into hard dependency edges versus softer precedence edges.

### Paper-grounded constraints

- GraSP explicitly inserts a compilation layer between retrieval and execution; Phase 36 should therefore index for compilation, not just for recall ranking.
- GraSP emphasizes that compilation prunes redundant skills into a minimal plan. This means the index should favor precise relation evidence over broad fuzzy linkage.
- GraSP treats state/data dependencies as harder constraints than order edges. TrapMap should preserve that distinction in extracted relation metadata so later phases can keep hard edges harder to rewrite.

### Library posture

- For this phase, introducing a focused graph utility library is warranted because Phase 36 is foundational infrastructure, not product-specific ranking logic.
- Do not introduce a full external GraphRAG runtime such as Microsoft GraphRAG or LightRAG into the server path.
- Exact dependency decision for the GraphRAG-lite graph layer:
  - `graphology`
  - `graphology-dag`
  - `graphology-operators`
  - `graphology-shortest-path`
- Rationale for choosing `graphology` over `@dagrejs/graphlib`:
  - official docs expose a broader maintained graph standard library including DAG helpers, operators, components, metrics, shortest-path, and traversal extensions
  - it fits the likely next-step needs beyond simple topsort, such as subgraph extraction, locality-bounded repair, and richer diagnostics
  - `graphlib` is viable for lighter DAG work, but its package surface is narrower and its npm/package metadata indicates a much slower release cadence
- Keep extraction, governance, retrieval orchestration, and public contracts in local TypeScript.
- Continue using PostgreSQL plus `pgvector` for durable vector storage when the project moves off the JSON store.
- Do not install `graphology-library`; use the small explicit modules above to keep the dependency surface bounded.

### Claude's Discretion

None provided in `36-CONTEXT.md`. [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

- Public graph-plan contracts
- Trap-first response compilation
- Confidence scoring and fallback routing
- Heavy graph analytics such as clustering or community summaries
</user_constraints>

## Summary

TrapMap already has the correct seam for this phase: `syncKnowledgeIndex` normalizes one approved knowledge record and fans the same document out to `vector`, `keyword`, and `graph` adapters, while non-approved or deactivated content is removed from indexes. The current limitation is that the graph adapter persists graph state only in process-local `Map` objects, and the lifecycle/indexing flow only covers `knowledgeEntries`, not `skillArtifacts`. [VERIFIED: codebase grep]

Skill artifacts already expose the text needed for graph extraction. `deriveFromPayloads` builds `profile` and `capsules` only from `SKILL.md` plus `references/`, and keeps `assets/` and `scripts/` in `clientManifest` metadata instead of retrieval text. That matches the user constraint to index approved derived text while excluding activation-only content. [VERIFIED: codebase grep]

The primary planning implication is to build a durable, deterministic graph-document layer inside the existing server indexing subsystem, not a second retrieval framework. Use `graphology` and its selected standard-library modules for graph assembly and validation, persist store-backed node/edge/source records keyed by artifact or entry revision, and add post-commit lifecycle triggers for approved/update/deactivate transitions on both traps and skills. GraSP is useful here as a design constraint on edge semantics, but Microsoft GraphRAG is explicitly out of scope because its standard pipeline is an LLM-heavy extraction-and-community-detection system rather than the lightweight deterministic index this phase needs. [CITED: https://arxiv.org/abs/2604.17870][CITED: https://microsoft.github.io/graphrag/index/overview/][VERIFIED: codebase grep]

**Primary recommendation:** Extend the existing adapter pipeline with a store-backed GraphRAG-lite graph document model for approved traps and derived skill capsules, using `graphology` for graph assembly and DAG checks while keeping extraction deterministic and local. [VERIFIED: codebase grep][CITED: https://graphology.github.io/][CITED: https://graphology.github.io/standard-library/dag.html]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `graphology` | `0.26.0` published `2025-01-26` [VERIFIED: npm registry] | In-memory graph object with serialization, node/edge attributes, and TypeScript support [CITED: https://graphology.github.io/] | Official docs describe it as the unified graph interface and point to a comprehensive standard library, which fits the locked decision to use explicit graph utilities rather than a full GraphRAG runtime. [CITED: https://graphology.github.io/][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] |
| `graphology-dag` | `0.4.1` published `2023-12-09` [VERIFIED: npm registry] | Cycle checks and topological ordering utilities [CITED: https://graphology.github.io/standard-library/dag.html] | Official docs expose `hasCycle`, `topologicalSort`, and `topologicalGenerations`, which directly support later compiler-facing hard-edge validation. [CITED: https://graphology.github.io/standard-library/dag.html] |
| `graphology-operators` | `1.6.1` published `2024-12-17` [VERIFIED: npm registry] | Subgraph extraction and graph conversion helpers [CITED: https://graphology.github.io/standard-library/operators.html] | `subgraph`, `union`, and graph casts are the standard way to produce bounded graph views instead of hand-rolling adjacency transforms. [CITED: https://graphology.github.io/standard-library/operators.html] |
| `graphology-shortest-path` | `2.1.0` published `2024-03-27` [VERIFIED: npm registry] | Unweighted and weighted path helpers [CITED: https://graphology.github.io/standard-library/shortest-path.html] | Official docs expose one-source and bidirectional traversal helpers that are sufficient for locality-bounded expansion without custom BFS/Dijkstra code. [CITED: https://graphology.github.io/standard-library/shortest-path.html] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing server indexing pipeline | local code [VERIFIED: codebase grep] | Adapter fan-out and lifecycle-driven sync/removal [VERIFIED: codebase grep] | Reuse for trap indexing and extend for skill artifact indexing rather than creating a parallel subsystem. [VERIFIED: codebase grep] |
| Existing skill derivation pipeline | local code [VERIFIED: codebase grep] | Generates governed `profile` and `capsules` from `SKILL.md` and `references/` only [VERIFIED: codebase grep] | Use as the canonical skill text source for graph extraction; do not index assets or script bodies. [VERIFIED: codebase grep] |
| Vitest | `3.2.4` installed locally [VERIFIED: local command] | Unit and integration coverage for indexing, lifecycle hooks, and reconciliation [VERIFIED: local command] | Use for phase tests because the repo already runs server tests through Vitest. [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit `graphology*` modules [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | `@dagrejs/graphlib` `4.0.1` [VERIFIED: npm registry] | `graphlib` is viable for lighter DAG work, but the locked decision favors `graphology` because its official standard library covers the next likely needs beyond simple DAG ordering. [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md][CITED: https://graphology.github.io/] |
| Microsoft GraphRAG indexing [CITED: https://microsoft.github.io/graphrag/index/overview/] | Local deterministic extraction in TrapMap [VERIFIED: codebase grep] | Microsoft’s standard indexing pipeline is an LLM-oriented extraction/community pipeline storing Parquet and vector outputs, which is heavier than this phase’s locked “GraphRAG-lite without external runtime” constraint. [CITED: https://microsoft.github.io/graphrag/index/overview/][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] |

**Installation:** [VERIFIED: package.json][VERIFIED: npm registry]
```bash
pnpm --filter @trapmap/server add graphology graphology-dag graphology-operators graphology-shortest-path
```

## Architecture Patterns

### Recommended Project Structure
```text
packages/server/src/lib/indexing/
├── pipeline.ts                 # existing trap adapter fan-out [VERIFIED: codebase grep]
├── events.ts                   # existing post-commit trap lifecycle hook [VERIFIED: codebase grep]
├── graph-lite/
│   ├── documents.ts            # durable graph source/node/edge record builders [ASSUMED]
│   ├── extractor.ts            # TrapMap-specific deterministic extraction for trap + skill text [ASSUMED]
│   ├── store.ts                # load/save graph docs from JsonStore-backed data [ASSUMED]
│   └── graphology.ts           # Graphology graph assembly, cycle checks, subgraph/path helpers [ASSUMED]
└── adapters/
    └── graph.ts                # adapter entry point rewritten to read/write durable graph docs [VERIFIED: codebase grep][ASSUMED]
packages/server/src/lib/artifacts/
└── indexing-events.ts          # skill lifecycle hook mirroring trap post-commit indexing [ASSUMED]
```

### Pattern 1: Reuse the Existing Adapter Fan-Out
**What:** `syncKnowledgeIndex` already normalizes once and then fans out to all registered adapters with per-adapter sync state persisted on the knowledge record. [VERIFIED: codebase grep]
**When to use:** Keep this pattern for traps and mirror it for skill artifacts so index lifecycle stays consistent across domains. [VERIFIED: codebase grep][ASSUMED]
**Example:**
```typescript
// Source: packages/server/src/lib/indexing/pipeline.ts [VERIFIED: codebase grep]
const normalizedDocument = normalizeKnowledgeIndexDocument(entry);
for (const adapter of adapters) {
  const result = await adapter.sync(normalizedDocument);
  entry.indexState[adapter.kind] = updateAdapterState(currentState, normalizedDocument, result);
}
```

### Pattern 2: Treat Derived Capsules as the Skill Index Unit
**What:** Skill derivation already emits governed capsules with `content`, `situation`, `problem`, `goal`, `labels`, `scope`, and `requiredLevel`, while `assets/` and `scripts/` stay in `clientManifest`. [VERIFIED: codebase grep]
**When to use:** Extract graph nodes and relations from capsule/profile text only after the artifact is approved. [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
**Example:**
```typescript
// Source: packages/server/src/lib/artifacts/derive.ts [VERIFIED: codebase grep]
const text = [
  capsule.situation,
  capsule.problem,
  capsule.goal,
  capsule.content,
  capsule.labels.join(' ')
].join('\n');
```

### Pattern 3: Build Durable Source Records, Then Assemble Graphology Views
**What:** Persist graph source documents in the store first, then build `graphology` graphs for validation, traversal, and export at query/reconcile time. `graphology` supports graph export/import and mutable node/edge attributes, so the persisted store format does not need to be raw adjacency maps. [CITED: https://graphology.github.io/serialization.html][CITED: https://graphology.github.io/mutation.html]
**When to use:** Use this whenever a lifecycle event changes approved trap or skill content. [VERIFIED: codebase grep][ASSUMED]
**Example:**
```typescript
// Source: https://graphology.github.io/mutation.html
import Graph from 'graphology';

const graph = new Graph();
graph.mergeNode('trap:docker-timeout', {kind: 'trap'});
graph.mergeNode('skill:docker-cache-clean', {kind: 'skill'});
graph.mergeEdgeWithKey(
  'trap:docker-timeout->skill:docker-cache-clean:mitigates',
  'trap:docker-timeout',
  'skill:docker-cache-clean',
  {relation: 'mitigates', strength: 'hard'}
);
```

### Pattern 4: Validate Hard Dependency Edges with DAG Utilities
**What:** GraSP’s compiler model distinguishes harder dependencies from softer order edges, and `graphology-dag` exposes cycle detection and topological ordering for directed graphs. [CITED: https://arxiv.org/abs/2604.17870][CITED: https://graphology.github.io/standard-library/dag.html]
**When to use:** Run DAG checks only on the hard-edge projection (`requires`, hard `risk-blocks`, hard `mitigates` if modeled as prerequisite), not on the entire mixed relation graph. [CITED: https://arxiv.org/abs/2604.17870][ASSUMED]
**Example:**
```typescript
// Source: https://graphology.github.io/standard-library/dag.html
import {DirectedGraph} from 'graphology';
import {hasCycle, topologicalGenerations} from 'graphology-dag';

const dag = new DirectedGraph();
if (hasCycle(dag)) throw new Error('hard dependency cycle');
const generations = topologicalGenerations(dag);
```

### Anti-Patterns to Avoid
- **Do not keep graph state only in `Map` caches:** the current adapter stores state in process-local `Map` objects, which is incompatible with durable skill/trap indexing and reconciliation. [VERIFIED: codebase grep]
- **Do not index `assets/` or script bodies:** derivation and context files already separate activation-only content from retrieval text, and the user explicitly locked this constraint. [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
- **Do not let generic entity classes drive the schema:** the current extractor only knows `service/tool/symptom/root-cause/fix/environment`, but this phase needs TrapMap-specific semantics and the locked edge set. [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
- **Do not trigger artifact graph writes inside long transactions without a post-commit boundary:** trap review routes already use a post-commit indexing call, which is the safer pattern to mirror for skills. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph container and serialization | Custom nested `Map<string, Set<string>>` structures | `graphology` [CITED: https://graphology.github.io/] | Official APIs already cover node/edge attributes, export/import, and TS support; custom structures repeat solved graph bookkeeping. [CITED: https://graphology.github.io/] |
| DAG validation | Homegrown cycle detection/toposort | `graphology-dag` [CITED: https://graphology.github.io/standard-library/dag.html] | Official helpers already throw on cyclic DAG projections and expose topological generations for planning. [CITED: https://graphology.github.io/standard-library/dag.html] |
| Subgraph extraction for query-time locality | Manual adjacency filtering | `graphology-operators/subgraph` [CITED: https://graphology.github.io/standard-library/operators.html] | Official operator returns bounded graph views directly from a node set or predicate. [CITED: https://graphology.github.io/standard-library/operators.html] |
| Traversal/path scoring | Custom BFS/Dijkstra | `graphology-shortest-path` [CITED: https://graphology.github.io/standard-library/shortest-path.html] | Official path helpers already cover unweighted and weighted shortest paths needed for locality-bounded expansion. [CITED: https://graphology.github.io/standard-library/shortest-path.html] |
| Skill text extraction | Re-reading raw artifact files during indexing | Existing derived `profile` and `capsules` [VERIFIED: codebase grep] | The derivation pipeline already enforces text-only, governance-aware inputs and excludes activation-only bodies. [VERIFIED: codebase grep] |

**Key insight:** Hand-rolling graph algorithms is unnecessary here; the only custom logic Phase 36 should own is TrapMap-specific extraction and persistence semantics. [CITED: https://graphology.github.io/][VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Mixing Hard Dependencies and Soft Ordering
**What goes wrong:** Later compilation cannot distinguish “must happen before” from “nice to do before,” so planners either over-constrain or rewrite edges unsafely. [CITED: https://arxiv.org/abs/2604.17870]
**Why it happens:** GraSP’s useful distinction is between harder precondition/effect dependencies and softer order edges, but the current repo extractor does not preserve that structure. [CITED: https://arxiv.org/abs/2604.17870][VERIFIED: codebase grep]
**How to avoid:** Persist relation metadata with at least `relationType`, `strength` (`hard`/`soft`), and source evidence so the future compiler can project only hard edges into a DAG. [CITED: https://arxiv.org/abs/2604.17870][ASSUMED]
**Warning signs:** Cycles appear in the full graph even for clearly valid plans, or query-time expansion treats all edges as equally rewriteable. [ASSUMED]

### Pitfall 2: Indexing Ungoverned Skill Content
**What goes wrong:** Assets or script bodies leak into retrieval/index state, weakening security and polluting extraction with non-text operational details. [VERIFIED: codebase grep]
**Why it happens:** Artifact revisions contain file metadata for `references/`, `assets/`, and `scripts/`, but only `SKILL.md` plus `references/` are derivation-eligible. [VERIFIED: codebase grep]
**How to avoid:** Index only approved `latestRevision.derived.profile` and `latestRevision.derived.capsules`, never raw file payloads or `clientManifest` script/asset bodies. [VERIFIED: codebase grep]
**Warning signs:** Graph nodes reference script filenames or asset paths as primary knowledge entities, or skill indexing touches `clientManifest.scripts[*].capability` without capsule/profile context. [VERIFIED: codebase grep][ASSUMED]

### Pitfall 3: Leaving Skill Lifecycle Outside the Indexing System
**What goes wrong:** Approved skills never appear in graph state, or deactivated skills remain queryable through stale graph edges. [VERIFIED: codebase grep]
**Why it happens:** Trap review/deactivate flows already call post-commit indexing, but the artifact review flow updates lifecycle state without a corresponding indexing event. [VERIFIED: codebase grep]
**How to avoid:** Add skill-side post-commit indexing hooks for approve, update, and deactivate, plus a reconcile pass that repairs drift across both domains. [VERIFIED: codebase grep][ASSUMED]
**Warning signs:** Trap indexing tests stay green while skill retrieval behavior changes only after server restart or manual store surgery. [ASSUMED]

### Pitfall 4: Keeping the Existing Generic Extractor Schema
**What goes wrong:** The graph fills with generic `mentions`-style pivots that are hard to compile into trap-first mitigation plans. [VERIFIED: codebase grep]
**Why it happens:** The current extractor is optimized for graph-assisted recall, not for skill/trap orchestration. [VERIFIED: codebase grep]
**How to avoid:** Replace or wrap the current extractor with a TrapMap-specific extractor that emits nodes like `trap`, `skill`, `cue`, `prerequisite`, and typed relations from the locked Phase 36 vocabulary. [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md][ASSUMED]
**Warning signs:** High graph density with little improvement in candidate narrowing, or many edges that cannot map cleanly into `mitigates`/`requires`/`order`/`risk-blocks`/`co-occurs-with`. [ASSUMED]

## Code Examples

Verified patterns from official sources and the current codebase:

### Graph Construction with Stable Keys
```typescript
// Source: https://graphology.github.io/mutation.html
import Graph from 'graphology';

const graph = new Graph();
graph.mergeNode('skill:pnpm-cache-reset', {kind: 'skill'});
graph.mergeNode('trap:pnpm-store-corruption', {kind: 'trap'});
graph.mergeEdgeWithKey(
  'trap:pnpm-store-corruption->skill:pnpm-cache-reset:mitigates',
  'trap:pnpm-store-corruption',
  'skill:pnpm-cache-reset',
  {relation: 'mitigates'}
);
```

### Hard-Edge DAG Validation
```typescript
// Source: https://graphology.github.io/standard-library/dag.html
import {DirectedGraph} from 'graphology';
import {hasCycle, topologicalSort} from 'graphology-dag';

const hardEdgeGraph = new DirectedGraph();
if (hasCycle(hardEdgeGraph)) throw new Error('invalid hard dependency cycle');
const order = topologicalSort(hardEdgeGraph);
```

### Bounded Graph View for Query Expansion
```typescript
// Source: https://graphology.github.io/standard-library/operators.html
import {subgraph} from 'graphology-operators';

const localView = subgraph(graph, new Set(['trap:docker-timeout', 'skill:docker-prune']));
```

### Existing Post-Commit Indexing Pattern to Mirror for Skills
```typescript
// Source: packages/server/src/routes/review.ts [VERIFIED: codebase grep]
await runKnowledgeIndexEvent({
  services: {store: app.skillShareer.store, data: await app.skillShareer.store.snapshot()},
  entryId,
  previousState,
  nextState,
  reason: `reviewer-${payload.decision}`,
  adapters: app.skillShareer.indexAdapters,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat skill sets or graph-assisted recall without a compilation layer [VERIFIED: codebase grep] | GraSP-style retrieval followed by compilation into typed executable DAGs [CITED: https://arxiv.org/abs/2604.17870] | GraSP preprint submitted `2026-04-20` [CITED: https://arxiv.org/abs/2604.17870] | For this phase, indexing should preserve dependency evidence and relation strength for later compilation instead of maximizing generic recall links. [CITED: https://arxiv.org/abs/2604.17870] |
| Full external GraphRAG pipelines with LLM extraction, community detection, and summary generation [CITED: https://microsoft.github.io/graphrag/index/overview/] | Local deterministic GraphRAG-lite indexing tuned to product semantics [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | Microsoft GraphRAG docs current as of 2025 site content [CITED: https://microsoft.github.io/graphrag/index/overview/] | TrapMap should borrow graph ideas, not adopt the whole runtime, because this phase needs durable typed edges and lifecycle indexing rather than LLM-heavy graph ETL. [CITED: https://microsoft.github.io/graphrag/index/overview/][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] |
| Current repo graph adapter uses process-local `Map` state and generic entity classes [VERIFIED: codebase grep] | Phase 36 should move to durable store-backed graph docs plus TrapMap-specific extraction [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md][VERIFIED: codebase grep] | Needed now for Phase 36 planning [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | This is the minimum viable infrastructure before Phase 37’s trap-first graph-plan compiler can rely on the index. [VERIFIED: .planning/STATE.md][ASSUMED] |

**Deprecated/outdated:**
- Generic `service/tool/symptom/root-cause/fix/environment` extraction is outdated for this phase because it cannot directly encode the locked relation vocabulary or skill/trap orchestration cues. [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
- Process-local graph caches are outdated for this phase because the approved index needs durable lifecycle-driven state across restarts and reconciliations. [VERIFIED: codebase grep]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A new `packages/server/src/lib/indexing/graph-lite/` module split is the cleanest repo-local organization for Phase 36. [ASSUMED] | Architecture Patterns | Low; files can move without changing the core plan. |
| A2 | Relation metadata should include an explicit `strength` field in addition to the locked relation enum. [ASSUMED] | Common Pitfalls | Medium; if omitted, Phase 37 may need a schema migration or weaker compiler guarantees. |
| A3 | A dedicated skill indexing event module beside artifact routes is cleaner than folding all logic into existing route files. [ASSUMED] | Architecture Patterns | Low; the plan can still succeed with a different file boundary. |

## Open Questions (RESOLVED)

1. **Where should durable graph documents live inside the current JSON store schema?**
   Resolution: add a top-level `graphIndexDocuments` collection on `StoreData`, keyed by `{sourceType, sourceId, revision}`.
   Reason: this keeps trap and skill graph persistence symmetric, makes reconcile/remove operations cross-domain instead of aggregate-specific, and avoids overloading domain aggregates with graph-runtime concerns. [VERIFIED: codebase grep][ASSUMED]

2. **Should trap and skill graph extraction share one extractor or two wrappers over shared primitives?**
   Resolution: use two source-specific entry points over shared graph-document primitives.
   Reason: trap and skill evidence shapes differ enough that forcing one fully unified extractor would reduce clarity, but shared node/edge builders and normalization helpers still preserve consistency. [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md][ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server package install, tests, and indexing implementation [VERIFIED: package.json] | ✓ [VERIFIED: local command] | `v20.19.5` [VERIFIED: local command] | — |
| `pnpm` | monorepo dependency install and filtered scripts [VERIFIED: package.json] | ✓ [VERIFIED: local command] | `10.33.0` [VERIFIED: local command] | `npm` can query registry but should not replace workspace installs. [VERIFIED: local command][VERIFIED: package.json] |
| `npm` | registry version verification [VERIFIED: npm registry] | ✓ [VERIFIED: local command] | `10.8.2` [VERIFIED: local command] | — |
| Vitest | phase validation runs [VERIFIED: codebase grep] | ✓ [VERIFIED: local command] | `3.2.4` [VERIFIED: local command] | — |
| TypeScript compiler | typecheck gate [VERIFIED: package.json] | ✓ [VERIFIED: local command] | `5.9.3` [VERIFIED: local command] | — |
| `graphology*` packages | new graph layer [VERIFIED: npm registry] | ✗ in repo [VERIFIED: codebase grep] | not installed [VERIFIED: codebase grep] | Install during Phase 36. [VERIFIED: npm registry] |

**Missing dependencies with no fallback:**
- None on the machine; the only missing items are the new repo dependencies this phase is expected to add. [VERIFIED: local command][VERIFIED: codebase grep]

**Missing dependencies with fallback:**
- None. Using anything other than the locked `graphology*` set would violate the phase context unless the user revises the decision. [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` [VERIFIED: local command] |
| Config file | `packages/server/vitest.config.ts` [VERIFIED: codebase grep] |
| Quick run command | `pnpm --filter @trapmap/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/events.test.ts` [VERIFIED: codebase grep][ASSUMED] |
| Full suite command | `pnpm --filter @trapmap/server test` [VERIFIED: package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P36-01 | Approved trap updates persist durable graph documents and adapter state [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/pipeline.test.ts src/lib/indexing/adapters/graph.test.ts` [VERIFIED: codebase grep][ASSUMED] | Partial; graph tests exist, durable-store coverage does not. [VERIFIED: codebase grep] |
| P36-02 | Approved skill artifacts index from derived capsule/profile text only [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | integration | `pnpm --filter @trapmap/server test -- src/lib/artifacts/derive.test.ts src/routes/operations.test.ts` [VERIFIED: codebase grep][ASSUMED] | Partial; derivation tests exist, skill indexing tests do not. [VERIFIED: codebase grep] |
| P36-03 | Deactivate/update/reapprove reconciles graph state across traps and skills [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | integration | `pnpm --filter @trapmap/server test -- src/lib/indexing/events.test.ts src/routes/review.test.ts src/routes/operations.test.ts` [VERIFIED: codebase grep][ASSUMED] | Partial; trap event tests exist, skill lifecycle indexing tests do not. [VERIFIED: codebase grep] |
| P36-04 | Hard-edge projection rejects cycles while soft edges may remain outside the DAG [CITED: https://arxiv.org/abs/2604.17870] | unit | `pnpm --filter @trapmap/server test -- src/lib/indexing/graph-lite/*.test.ts` [ASSUMED] | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @trapmap/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/indexing/pipeline.test.ts src/lib/indexing/events.test.ts` [VERIFIED: codebase grep][ASSUMED]
- **Per wave merge:** `pnpm --filter @trapmap/server test` [VERIFIED: package.json]
- **Phase gate:** `pnpm typecheck && pnpm --filter @trapmap/server test` [VERIFIED: package.json]

### Wave 0 Gaps
- [ ] `packages/server/src/lib/indexing/graph-lite/*.test.ts` — new durable graph document builders, graphology assembly, DAG validation, and subgraph/path helpers need direct coverage. [ASSUMED]
- [ ] `packages/server/src/lib/indexing/skill-events.test.ts` or equivalent — no existing skill lifecycle indexing tests were found. [VERIFIED: codebase grep][ASSUMED]
- [ ] `packages/server/src/routes/operations.test.ts` additions — skill approve/update/deactivate flows need post-commit indexing assertions. [VERIFIED: codebase grep][ASSUMED]
- [ ] `packages/server/src/lib/indexing/reconcile.test.ts` additions — no current coverage verifies cross-domain graph reconciliation against both traps and skills. [VERIFIED: codebase grep][ASSUMED]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: codebase grep] | Existing auth/session system remains unchanged in this phase. [VERIFIED: codebase grep] |
| V3 Session Management | no [VERIFIED: codebase grep] | Existing session controls remain unchanged in this phase. [VERIFIED: codebase grep] |
| V4 Access Control | yes [VERIFIED: AGENTS.md][VERIFIED: codebase grep] | Index only approved content and preserve `scope` plus `requiredLevel` inheritance from trap entries and skill capsules. [VERIFIED: codebase grep][VERIFIED: AGENTS.md] |
| V5 Input Validation | yes [VERIFIED: AGENTS.md] | Keep extraction deterministic over already-validated store records and use bounded relation enums instead of free-form edge types. [VERIFIED: codebase grep][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] |
| V6 Cryptography | no [VERIFIED: codebase grep] | No new cryptographic primitive is needed; hashing and auth remain existing concerns. [VERIFIED: codebase grep] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Indexed governance leakage from non-approved or over-level content [VERIFIED: codebase grep] | Information Disclosure | Gate indexing on approved lifecycle state and persist governance metadata for query-time filtering/intersection. [VERIFIED: codebase grep] |
| Stale graph edges after deactivate/update [VERIFIED: codebase grep] | Tampering | Post-commit remove/upsert hooks plus reconcile repair jobs across both domains. [VERIFIED: codebase grep][ASSUMED] |
| Activation-only file content entering retrieval graph [VERIFIED: codebase grep] | Information Disclosure | Source graph extraction only from derived capsule/profile text and never from `assets/` or script bodies. [VERIFIED: codebase grep] |
| Edge poisoning via unconstrained extractor output [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md] | Tampering | Use a small typed relation enum and deterministic evidence-backed extraction rules. [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md][ASSUMED] |

## Sources

### Primary (HIGH confidence)
- `36-CONTEXT.md` - locked implementation decisions, scope boundaries, and dependency posture. [VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
- `packages/server/src/lib/indexing/pipeline.ts` - existing adapter fan-out and lifecycle gating. [VERIFIED: codebase grep]
- `packages/server/src/lib/indexing/adapters/graph.ts` - current in-memory graph cache and global index design. [VERIFIED: codebase grep]
- `packages/server/src/lib/retrieval/graph-extract.ts` - current generic extractor schema and relation vocabulary. [VERIFIED: codebase grep]
- `packages/server/src/lib/artifacts/derive.ts` - derivation-eligible skill text and activation-only exclusions. [VERIFIED: codebase grep]
- `https://graphology.github.io/` - core graphology API, TS support, and standard library positioning. [CITED: https://graphology.github.io/]
- `https://graphology.github.io/mutation.html` - `addNode`, `mergeNode`, `addEdge`, `mergeEdgeWithKey`, and attribute mutation semantics. [CITED: https://graphology.github.io/mutation.html]
- `https://graphology.github.io/serialization.html` - export/import graph serialization model. [CITED: https://graphology.github.io/serialization.html]
- `https://graphology.github.io/standard-library/dag.html` - cycle detection and topological ordering helpers. [CITED: https://graphology.github.io/standard-library/dag.html]
- `https://graphology.github.io/standard-library/operators.html` - `subgraph`, `union`, and graph cast operators. [CITED: https://graphology.github.io/standard-library/operators.html]
- `https://graphology.github.io/standard-library/shortest-path.html` - shortest-path traversal helpers. [CITED: https://graphology.github.io/standard-library/shortest-path.html]
- `https://arxiv.org/abs/2604.17870` - GraSP abstract and compilation-oriented edge semantics. [CITED: https://arxiv.org/abs/2604.17870]

### Secondary (MEDIUM confidence)
- `https://microsoft.github.io/graphrag/index/overview/` - official GraphRAG indexing pipeline overview used only to justify why the external runtime is heavier than this phase needs. [CITED: https://microsoft.github.io/graphrag/index/overview/]
- `https://www.microsoft.com/en-us/research/project/graphrag/` - official Microsoft Research project page for GraphRAG scope and current status. [CITED: https://www.microsoft.com/en-us/research/project/graphrag/]

### Tertiary (LOW confidence)
- None. [VERIFIED: sources above]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package versions were verified against the npm registry and APIs against official docs. [VERIFIED: npm registry][CITED: https://graphology.github.io/]
- Architecture: MEDIUM - the recommended file/module split contains a few explicit assumptions, but the extension points and current gaps are verified in code. [VERIFIED: codebase grep]
- Pitfalls: HIGH - most failure modes are directly visible from the current code or from the locked GraSP constraints. [VERIFIED: codebase grep][CITED: https://arxiv.org/abs/2604.17870]

**Research date:** 2026-04-24 [VERIFIED: environment context]
**Valid until:** 2026-05-24 for library/version checks; earlier if the user changes the locked Graphology dependency posture. [VERIFIED: npm registry][VERIFIED: .planning/phases/36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract/36-CONTEXT.md]
