# Phase 42: Replace Hand-Rolled Graph Operations with Graphology-Based GraphRAG Runtime - Research

**Researched:** 2026-04-25
**Domain:** GraphRAG runtime migration from legacy map-based traversal to graphology-backed query-time operations
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Phase 42 should replace the current hand-rolled graph storage and traversal operations with a Graphology-based runtime that can support GraphRAG-lite retrieval and compilation. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- This phase is about graph runtime replacement. It is not about database persistence migration or public contract design. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Replace process-local graph helper structures with Graphology-backed graph state. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Migrate graph-assisted traversal, relation expansion, and graph diagnostics onto library operators. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Add graph utilities needed by later GraphRAG-lite phases, such as cycle detection, neighborhood inspection, and path ordering. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Keep current governance filtering behavior intact while changing internal graph mechanics. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- The current graph code was acceptable for early graph-assisted retrieval but is too narrow for the upcoming GraphRAG-lite compiler. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Graphology should be used for internal graph mechanics, not exposed as a public API. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Governance and retrieval scoring remain local product logic even after graph runtime replacement. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Represent trap/skill graph state through Graphology rather than manual `Map<string, Set<string>>` plus `Map<string, GraphRelation[]>`. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Move traversal and graph inspection helpers behind internal graph runtime modules. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Reuse the selected Graphology modules for graph construction, DAG validation, topological ordering, focused subgraph extraction, and path/reachability inspection. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]

### Claude's Discretion

- No separate `## Claude's Discretion` section exists in `42-CONTEXT.md`; planner discretion is limited to implementation slicing inside the locked runtime-migration boundary. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

- Database persistence of Graphology state. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Public graph export endpoints. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Full local repair operators inspired by GraSP. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
- Community-level graph analytics. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]
</user_constraints>

## Summary

Phase 42 is a query-time/runtime migration, not a schema or storage migration. Durable graph documents already exist in `StoreData.graphIndexDocuments`, and the graphology wrapper already assembles directed multi-graphs, projects hard-edge DAGs, validates cycles, and builds bounded local expansion views. [VERIFIED: packages/server/src/lib/store.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]

The remaining hand-rolled runtime is concentrated in the legacy compatibility path: `packages/server/src/lib/indexing/adapters/graph.ts` still maintains `globalGraphIndex.entities` and `globalGraphIndex.relations`; `packages/server/src/lib/retrieval/recall/graph-assisted.ts` still rebuilds a synthetic `GraphIndexSource`, manually expands one hop, and manually scans relations to compute support strength. [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts]

The lowest-risk plan is to replace graph-assisted recall internals with a graphology-backed runtime built directly from persisted graph documents, then remove the legacy in-memory fallback after the orchestrator always passes a store snapshot. Persisted graph documents, `extractTrapGraphEntities()`, and public retrieval contracts should remain additive and unchanged in this phase. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts] [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]

**Primary recommendation:** Replace `graph-assisted.ts` map-scanning with a small internal graphology runtime module that consumes `GraphIndexDocumentRecord[]`, exposes neighborhood/reachability helpers, and keeps governance/scoring logic in TrapMap code. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] [CITED: https://graphology.github.io/instantiation.html] [CITED: https://graphology.github.io/standard-library/dag.html] [CITED: https://graphology.github.io/standard-library/shortest-path.html]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `graphology` | `0.26.0` published 2025-01-26 [VERIFIED: npm registry] | In-memory graph object model for directed multi-graphs. [CITED: https://graphology.github.io/instantiation.html] | Already installed in `@trapmap/server` and already used by `graph-lite/graphology.ts`. [VERIFIED: packages/server/package.json] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `graphology-dag` | `0.4.1` published 2023-12-09 [VERIFIED: npm registry] | DAG checks such as `hasCycle`. [CITED: https://graphology.github.io/standard-library/dag.html] | Already wrapped by `assertNoHardDependencyCycles()`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `graphology-operators` | `1.6.1` published 2024-12-17 [VERIFIED: npm registry] | Focused subgraph extraction. [CITED: https://graphology.github.io/standard-library/operators.html] | Already wrapped by `buildLocalExpansionView()`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| `graphology-shortest-path` | `2.1.0` published 2024-03-27 [VERIFIED: npm registry] | Bounded reachability with `singleSourceLength`. [CITED: https://graphology.github.io/standard-library/shortest-path.html] | Already wrapped by `buildLocalExpansionView()`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TrapMap `graph-lite/graphology.ts` wrapper | local module [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] | Package-local boundary for graph construction and graph operators. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] | Use for all Phase 42 runtime helpers instead of importing graphology primitives across retrieval files. [VERIFIED: .planning/phases/41-introduce-graphology-and-parsing-libraries-to-replace-hand-r/41-RESEARCH.md] |
| TrapMap `graph-extract.ts` typed extractor | local module [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts] | Produces locked node/edge vocabulary for trap documents. [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts] | Keep as-is in Phase 42; this phase swaps traversal/runtime mechanics, not extraction semantics. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local graphology wrapper | Direct graphology imports in retrieval modules | Rejected because Phase 41 explicitly established a local wrapper boundary. [VERIFIED: .planning/phases/41-introduce-graphology-and-parsing-libraries-to-replace-hand-r/41-RESEARCH.md] |

**Installation:**
```bash
pnpm --filter @trapmap/server add graphology graphology-dag graphology-operators graphology-shortest-path
```

## Architecture Patterns

### Recommended Project Structure
```text
packages/server/src/lib/
├── indexing/graph-lite/
│   ├── documents.ts        # durable graph document schema
│   ├── graphology.ts       # graph construction and core operators
│   └── store.ts            # persisted document access
└── retrieval/
    ├── graph-runtime.ts    # new Phase 42 query-time graphology helpers
    ├── graph-extract.ts    # existing typed extraction and legacy adapter
    └── recall/graph-assisted.ts # governed scoring + graph runtime calls
```

### Pattern 1: Runtime Reads From Persisted Graph Documents
**What:** Build query-time graph state from `getGraphIndexDocuments(data)` and graphology wrappers, not from `globalGraphIndex`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/store.ts] [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts]
**When to use:** For every graph-assisted query path once the orchestrator can provide a snapshot. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
**Example:**
```typescript
// Source: packages/server/src/lib/indexing/graph-lite/graphology.ts
const graphDocs = getGraphIndexDocuments(data);
const localView = buildLocalExpansionView({
  documents: graphDocs,
  seedNodeIds,
  maxDepth: 1,
});
```

### Pattern 2: Keep Governance Outside the Graph Runtime
**What:** Use the graph runtime only to return node/edge neighborhoods or candidate source IDs; continue filtering final entries through the eligible-entry map. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]
**When to use:** All graph-assisted query expansion and future GraphRAG-lite plan compilation. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]

### Pattern 3: Preserve Typed Edge Semantics
**What:** Traverse using the existing `relationType` and `strength` attributes already attached in `buildGraphFromDocuments()`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]
**When to use:** Relation-strength scoring, blocker discovery, mitigation expansion, and deterministic path ordering. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]

### Anti-Patterns to Avoid
- **Rebuilding the legacy `entities/relations` map from documents:** `buildGlobalIndexFromDocuments()` reproduces the compatibility model rather than using graphology operators directly. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts]
- **Cutting over query-time reads before passing a snapshot:** the live orchestrator currently calls `graphRecall(seed, eligibleEntriesMap)` with no `dataSnapshot`, so removing the fallback first would break graph-assisted mode. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]
- **Changing durable graph document schema in this phase:** persistence and public contract work are explicitly deferred to later phases. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]

## Implementation Slices

### Slice 1: Introduce a Query-Time Graph Runtime Module
- Add a new internal module that accepts `GraphIndexDocumentRecord[]` and exposes `buildRecallGraph()`, `collectSeedNodeIds()`, `expandNeighborhood()`, and `collectSupportingEdges()`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/documents.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]
- Reuse graphology node/edge attributes already emitted by `buildGraphFromDocuments()`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]

### Slice 2: Port `graph-assisted.ts` Off the Legacy Map Shape
- Replace `GraphIndexSource`, `expandOneHop()`, `calculateRelationStrength()`, and `buildGlobalIndexFromDocuments()` with runtime helpers over a graphology graph. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts]
- Keep query extraction and final candidate scoring in TrapMap code. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md]

### Slice 3: Change Orchestrator Wiring
- Pass `services.store.snapshot()` data into graph-assisted recall so query-time graph reads come from durable documents rather than `getGlobalGraphIndex()`. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts]
- Keep the public retrieval mode name `graph-assisted` unchanged. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

### Slice 4: Remove Compatibility State After Cutover
- Delete `globalGraphIndex`, `getGlobalGraphIndex()`, and `clearGraphCache()` only after graph-assisted tests are rewritten to use graph documents instead of synthetic legacy state. [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directed multi-graph storage | `Map<string, Set<string>>` plus `Map<string, GraphRelation[]>` | `buildGraphFromDocuments()` over graphology. [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] | The custom shape is the exact legacy surface Phase 42 is replacing. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md] |
| One-hop / bounded expansion | Manual scans across every relation array | `singleSourceLength()` + `subgraph()` through the wrapper. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] [CITED: https://graphology.github.io/standard-library/shortest-path.html] |
| Cycle detection | Custom DFS cycle checks | `hasCycle()` on the projected hard-edge DAG. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] [CITED: https://graphology.github.io/standard-library/dag.html] |
| Focused subgraph extraction | Ad hoc pruning logic | `subgraph()` through the wrapper. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] [CITED: https://graphology.github.io/standard-library/operators.html] |

**Key insight:** TrapMap should keep domain semantics and governance local, but it should stop re-implementing graph storage, reachability, and subgraph mechanics that graphology already provides. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `StoreData.graphIndexDocuments` already stores durable trap/skill graph documents. [VERIFIED: packages/server/src/lib/store.ts] | Code edit only: query-time runtime should read existing documents; no data migration is needed in Phase 42 if document schema stays unchanged. [VERIFIED: packages/server/src/lib/indexing/graph-lite/documents.ts] |
| Live service config | None found in repo-managed graph runtime paths; graph-assisted mode is code-driven, not UI-configured. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] | None. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| OS-registered state | None found; graph runtime is process-local server code. [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts] | None. [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts] |
| Secrets/env vars | None found for graph runtime naming or graphology configuration. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] | None. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] |
| Build artifacts | Built server output can retain the old runtime until rebuild. [ASSUMED] | Re-run server build/tests after cutover. [VERIFIED: package.json] |

## Common Pitfalls

### Pitfall 1: Migrating Only the Storage Shape, Not the Query Path
**What goes wrong:** The repo already has graphology utilities, but live graph-assisted retrieval still uses the legacy fallback because the orchestrator does not pass a snapshot. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts]
**How to avoid:** Make the orchestrator pass snapshot data before deleting the legacy global index. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

### Pitfall 2: Keeping Legacy Relation Semantics in Tests
**What goes wrong:** `graph-assisted.test.ts` still models legacy relation names such as `observed-in`, `causes`, `fixed-by`, and `uses-tool`, while the runtime code now centers on typed relations like `mitigates`, `requires`, `order`, `risk-blocks`, and `co-occurs-with`. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts] [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts]
**How to avoid:** Rewrite tests around `GraphIndexDocumentRecord` fixtures and graphology-backed helpers instead of synthetic `PersistedGraphState`. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/documents.ts]

### Pitfall 3: Mixing Node Labels and Node IDs
**What goes wrong:** The compatibility path normalizes node labels into entity keys, but the graphology runtime uses canonical node IDs on edges and nodes. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts]
**How to avoid:** Seed and traverse by node IDs, and use labels only for matching/query extraction or display. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]

## Code Examples

Verified patterns from current code and official docs:

### Bounded Local View
```typescript
// Source: packages/server/src/lib/indexing/graph-lite/graphology.ts
const localView = buildLocalExpansionView({
  documents: graphDocs,
  seedNodeIds: ['trap:entry-1'],
  maxDepth: 2,
});
```

### Hard-Edge Cycle Validation
```typescript
// Source: packages/server/src/lib/indexing/graph-lite/graphology.ts
assertNoHardDependencyCycles(graphDocs);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy generic entity/relation compatibility (`service`, `symptom`, `fixed-by`, `observed-in`) | Typed TrapMap graph vocabulary (`trap`, `skill`, `cue`, `mitigates`, `requires`, `risk-blocks`) | Introduced by Phases 36-41 in current codebase. [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts] [VERIFIED: .planning/phases/41-introduce-graphology-and-parsing-libraries-to-replace-hand-r/41-RESEARCH.md] | Phase 42 should keep the typed vocabulary and remove only the hand-rolled runtime mechanics. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md] |
| Manual one-hop scans over compatibility maps | Graphology-backed bounded expansion and focused subgraphs | Available now in `graph-lite/graphology.ts`. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] | Phase 42 can standardize retrieval runtime on the same primitives already used by plan compilation. [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts] |

**Deprecated/outdated:**
- `extractGraphEntities()` legacy output is explicitly marked `@deprecated` and exists only for backward compatibility. [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts]
- `getGlobalGraphIndex()` and `clearGraphCache()` are explicitly marked `@deprecated` in the graph adapter. [VERIFIED: packages/server/src/lib/indexing/adapters/graph.ts]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Built server artifacts may retain the old runtime until rebuild. | Runtime State Inventory | Low; planner may omit an extra rebuild command if this assumption is wrong. |

## Open Questions

1. **Should Phase 42 add a dedicated retrieval-local graph runtime file or extend `indexing/graph-lite/graphology.ts`?**
   - What we know: both options satisfy the local-boundary rule. [VERIFIED: .planning/phases/41-introduce-graphology-and-parsing-libraries-to-replace-hand-r/41-RESEARCH.md]
   - What's unclear: the repo has not yet established a retrieval-side runtime module. [VERIFIED: packages/server/src/lib/retrieval]
   - Recommendation: prefer a retrieval-local wrapper that composes `graph-lite/graphology.ts`, so indexing and query-time concerns stay separate. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server tests and local scripts | ✓ [VERIFIED: local command] | `v20.19.5` [VERIFIED: local command] | — |
| `pnpm` | workspace test/typecheck commands | ✓ [VERIFIED: local command] | `10.33.0` [VERIFIED: local command] | `npm` for package metadata only; not for workspace execution. [VERIFIED: package.json] |
| TrapMap retrieval gate | skill/trap retrieval preflight | ✗ [VERIFIED: local command] | HTTP 404 [VERIFIED: local command] | Proceed from local code and prior phase artifacts only. [VERIFIED: user prompt] |

**Missing dependencies with no fallback:**
- None for research-only work. [VERIFIED: local command]

**Missing dependencies with fallback:**
- Live TrapMap retrieval is blocked by HTTP 404, so planning must rely on repo artifacts instead of runtime retrieval. [VERIFIED: local command]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4`. [VERIFIED: package.json] |
| Config file | none; package scripts call `vitest run`. [VERIFIED: package.json] |
| Quick run command | `pnpm --filter @trapmap/server test -- src/lib/retrieval/recall/graph-assisted.test.ts src/lib/indexing/graph-lite/graphology.test.ts`. [VERIFIED: packages/server/package.json] |
| Full suite command | `pnpm --filter @trapmap/server test`. [VERIFIED: packages/server/package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P42-R1 | Graph-assisted runtime reads persisted graph docs through graphology instead of legacy maps. [RECOMMENDATION] | unit/integration | `pnpm --filter @trapmap/server test -- src/lib/retrieval/recall/graph-assisted.test.ts` | ✅ existing file, but requires migration from legacy fixtures. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts] |
| P42-R2 | Governance filtering remains intact after graph expansion. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] | unit | `pnpm --filter @trapmap/server test -- src/lib/retrieval/recall/graph-assisted.test.ts -t "authorization safety"` | ✅ [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts] |
| P42-R3 | Existing graphology helpers still validate cycles and bounded expansion. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] | unit | `pnpm --filter @trapmap/server test -- src/lib/indexing/graph-lite/graphology.test.ts` | ✅ [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.test.ts] |
| P42-R4 | Search endpoint still supports `graph-assisted` mode after orchestrator rewiring. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] | integration | `pnpm --filter @trapmap/server test -- src/lib/retrieval/orchestrator.test.ts` | ❌ Wave 0; add or extend orchestrator coverage. [VERIFIED: packages/server/src/lib/retrieval] |

### Sampling Rate
- **Per task commit:** `pnpm --filter @trapmap/server test -- src/lib/retrieval/recall/graph-assisted.test.ts src/lib/indexing/graph-lite/graphology.test.ts`
- **Per wave merge:** `pnpm --filter @trapmap/server test`
- **Phase gate:** `pnpm --filter @trapmap/server test && pnpm --filter @trapmap/server typecheck`

### Wave 0 Gaps
- [ ] Rewrite `src/lib/retrieval/recall/graph-assisted.test.ts` to use `GraphIndexDocumentRecord` fixtures instead of legacy `PersistedGraphState`. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts]
- [ ] Add or extend orchestrator coverage for the snapshot-backed graph-assisted path. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing auth context is unchanged in this phase. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] |
| V3 Session Management | no | No session behavior changes are in scope. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md] |
| V4 Access Control | yes | Keep graph-derived candidates intersected with governed eligible entries. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] |
| V5 Input Validation | yes | Keep existing retrieval query parsing and typed extraction entrypoints. [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts] [VERIFIED: packages/server/src/lib/retrieval/graph-extract.ts] |
| V6 Cryptography | no | No cryptographic changes are in scope. [VERIFIED: .planning/phases/42-replace-hand-rolled-graph-operations-with-graphology-based-g/42-CONTEXT.md] |

### Known Threat Patterns for GraphRAG Runtime

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized entry leakage through graph expansion | Information Disclosure | Intersect graph-derived IDs with the eligible-entry set before scoring/returning results. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] |
| Unbounded graph traversal causing noisy or unstable results | Denial of Service | Keep bounded local expansion and deterministic max-depth traversal. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |
| Hard dependency cycles entering the runtime | Tampering | Reuse `assertNoHardDependencyCycles()` for any runtime path that compiles hard-edge plans. [VERIFIED: packages/server/src/lib/indexing/graph-lite/graphology.ts] |

## Sources

### Primary (HIGH confidence)
- `packages/server/src/lib/indexing/adapters/graph.ts` - legacy in-memory graph cache and deprecated compatibility exports. [VERIFIED: codebase]
- `packages/server/src/lib/retrieval/recall/graph-assisted.ts` - remaining hand-rolled one-hop expansion, synthetic map building, and relation-strength scoring. [VERIFIED: codebase]
- `packages/server/src/lib/indexing/graph-lite/graphology.ts` - current graphology wrapper used by indexing and plan compilation. [VERIFIED: codebase]
- `packages/server/src/lib/retrieval/orchestrator.ts` - live `graph-assisted` wiring still omits `dataSnapshot`. [VERIFIED: codebase]
- `packages/server/src/lib/retrieval/graph-extract.ts` - typed extractor plus deprecated legacy compatibility output. [VERIFIED: codebase]
- `https://graphology.github.io/instantiation.html` - graph instantiation surface. [CITED: https://graphology.github.io/instantiation.html]
- `https://graphology.github.io/standard-library/dag.html` - DAG helpers such as `hasCycle`. [CITED: https://graphology.github.io/standard-library/dag.html]
- `https://graphology.github.io/standard-library/operators.html` - operators such as `subgraph`. [CITED: https://graphology.github.io/standard-library/operators.html]
- `https://graphology.github.io/standard-library/shortest-path.html` - shortest-path helpers such as `singleSourceLength`. [CITED: https://graphology.github.io/standard-library/shortest-path.html]
- npm registry metadata for `graphology`, `graphology-dag`, `graphology-operators`, and `graphology-shortest-path`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- `.planning/phases/41-introduce-graphology-and-parsing-libraries-to-replace-hand-r/41-RESEARCH.md` - wrapper-boundary decision already locked in Phase 41. [VERIFIED: local artifact]

### Tertiary (LOW confidence)
- None. [VERIFIED: this research]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions were verified against `package.json` and npm registry, and usage was confirmed in current code. [VERIFIED: packages/server/package.json] [VERIFIED: npm registry]
- Architecture: HIGH - the current runtime split between legacy graph-assisted recall and graphology-backed plan compilation is explicit in code. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.ts] [VERIFIED: packages/server/src/lib/retrieval/plan-compiler.ts]
- Pitfalls: HIGH - each pitfall is grounded in current code/test mismatches rather than ecosystem folklore. [VERIFIED: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts] [VERIFIED: packages/server/src/lib/retrieval/orchestrator.ts]

**Research date:** 2026-04-25
**Valid until:** 2026-05-02
