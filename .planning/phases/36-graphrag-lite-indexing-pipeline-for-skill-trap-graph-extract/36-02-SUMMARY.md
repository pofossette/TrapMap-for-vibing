---
phase: 36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract
plan: 02
subsystem: indexing
tags: [graphrag, graphology, trap-extraction, graph-adapter, durable-persistence]

# Dependency graph
requires:
  - phase: 36-01
    provides: "graph-lite documents, store, and graphology helpers (buildTrapGraphDocument, upsertGraphIndexDocument, assertNoHardDependencyCycles)"
provides:
  - "TrapMap-specific trap extraction (extractTrapGraphEntities) with locked node/edge vocabulary"
  - "Pure buildTrapGraphDocument helper in graph-builders.ts for pre-persist candidate assembly"
  - "Store-backed graph adapter with hard-edge cycle validation before persist"
  - "Graph adapter registered in buildDefaultIndexAdapters alongside vector and keyword"
  - "Graph-assisted recall with optional store-backed graph document reads"
affects: [37-graphrag-lite-retrieval-compiler, 38-graphrag-lite-routing-fallback, retrieval, indexing]

# Tech tracking
tech-stack:
  added: []
  patterns: ["TrapMap-specific extraction vocabulary (6 node kinds, 5 relation types, hard/soft strength)", "Store-backed adapter sync with pre-persist cycle validation", "Optional dataSnapshot parameter for store-backed recall reads"]

key-files:
  created:
    - packages/server/src/lib/indexing/adapters/graph-builders.ts
  modified:
    - packages/server/src/lib/retrieval/graph-extract.ts
    - packages/server/src/lib/indexing/adapters/graph.ts
    - packages/server/src/lib/indexing/adapters/index.ts
    - packages/server/src/lib/retrieval/recall/graph-assisted.ts
    - packages/server/src/lib/indexing/adapters/graph.test.ts

key-decisions:
  - "Kept backward-compatible extractGraphEntities wrapper that maps new TrapMap vocabulary to old generic types, preserving all existing callers during migration"
  - "Adapter sync uses store.transact() for durable writes rather than snapshot()+mutation which would be lost"
  - "Graph-assisted recall reads from store-backed documents when dataSnapshot is provided, otherwise falls back to legacy in-memory index"

patterns-established:
  - "Pre-persist validation: build candidate graph document, append to existing docs, run cycle check, then upsert only if validation passes"
  - "Dual-mode recall: function accepts optional dataSnapshot config for store-backed reads while keeping legacy in-memory fallback"

requirements-completed: [P36-01]

# Metrics
duration: 30min
completed: 2026-04-25
---

# Phase 36 Plan 02: Trap Graph Extraction and Durable Adapter Summary

**TrapMap-specific trap extraction with locked node/edge vocabulary, store-backed graph adapter with hard-edge cycle validation, and durable recall path**

## Performance

- **Duration:** 30 min
- **Started:** 2026-04-24T15:35:43Z
- **Completed:** 2026-04-25T00:05:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced generic graph entity extraction (service/tool/symptom/root-cause/fix/environment) with TrapMap-specific vocabulary (trap/cue/tool/environment/prerequisite/mitigation nodes; mitigates/requires/order/risk-blocks/co-occurs-with edges with hard/soft strength)
- Added pure buildTrapGraphDocument helper that assembles GraphIndexDocumentRecord candidates without persisting, enabling pre-persist validation
- Rewrote graph adapter to use store.transact() for durable document persistence with hard-edge cycle validation via assertNoHardDependencyCycles before any upsert
- Registered graph adapter in buildDefaultIndexAdapters so trap lifecycle sync uses vector, keyword, and graph adapters together
- Updated graph-assisted recall to support store-backed graph document reads via optional dataSnapshot config parameter

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace generic trap extraction with TrapMap-specific graph semantics** - `faf5f79` (test), `d0dbfaf` (feat)
2. **Task 2: Persist trap graph state through the graph adapter and recall path** - `87b7566` (feat)

## Files Created/Modified

- `packages/server/src/lib/indexing/adapters/graph-builders.ts` - Pure buildTrapGraphDocument helper for pre-persist candidate assembly
- `packages/server/src/lib/retrieval/graph-extract.ts` - TrapMap-specific extraction with locked vocabulary and backward-compat wrapper
- `packages/server/src/lib/indexing/adapters/graph.ts` - Store-backed graph adapter with cycle validation
- `packages/server/src/lib/indexing/adapters/index.ts` - Graph adapter registration in default adapter list
- `packages/server/src/lib/retrieval/recall/graph-assisted.ts` - Store-backed graph document reads for recall
- `packages/server/src/lib/indexing/adapters/graph.test.ts` - Tests for TrapMap vocabulary, edge strength, and durable adapter

## Decisions Made

- **Kept backward-compatible extractGraphEntities wrapper** - Maps new TrapMap vocabulary to old generic types (trap/cue->symptom, prerequisite->root-cause, mitigation->fix). Preserves all existing callers (graph-assisted.test.ts, graph-extract.test.ts, orchestrator) during migration without breaking changes.
- **Adapter sync uses store.transact()** - Using snapshot()+mutation would lose writes since snapshot returns a copy. transact() ensures read-mutate-write atomicity.
- **Dual-mode recall path** - graphAssistedRecall accepts optional dataSnapshot config for store-backed reads. When not provided, falls back to legacy in-memory global graph index. This avoids breaking the existing orchestrator while enabling the new durable path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added backward-compatible legacy extraction wrapper**
- **Found during:** Task 1 (extraction rewrite)
- **Issue:** Multiple existing callers (graph-extract.test.ts, graph-assisted.ts, graph-assisted.test.ts) depend on the old extractGraphEntities function with generic entity types. Removing it outright would break 24 existing tests.
- **Fix:** Added deprecated extractGraphEntities function that delegates to new extractTrapGraphEntities and maps new vocabulary to old types. Also extracts service entities from PascalCase patterns and root-cause entities from causal phrases for full backward compat.
- **Files modified:** packages/server/src/lib/retrieval/graph-extract.ts
- **Verification:** All 556 existing tests pass with the wrapper in place
- **Committed in:** d0dbfaf (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed test helper to recompute canonicalText on override**
- **Found during:** Task 1 (test writing)
- **Issue:** Test helper makeApprovedTrapDoc did not recompute canonicalText when detail/shortcut/labels were overridden, so extraction functions reading canonicalText got stale content
- **Fix:** Updated helper to recompute canonicalText from shortcut+detail+labels when any are overridden
- **Files modified:** packages/server/src/lib/indexing/adapters/graph.test.ts
- **Verification:** Hard mitigation edge tests pass correctly
- **Committed in:** d0dbfaf (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness and existing test stability. No scope creep.

## Issues Encountered

None - implementation followed plan structure with predictable backward-compat adjustments.

## Known Stubs

- The `extractGraphEntities` backward-compat wrapper maps all new relation types to legacy types. This stub should be removed once all callers are migrated to use `extractTrapGraphEntities` directly (tracked for post-Phase 36 cleanup).
- `graphAssistedRecall` does not yet receive a `dataSnapshot` from the orchestrator. The orchestrator still calls it with the old signature. A future phase should update the orchestrator to pass the data snapshot so recall reads durable state.

## Next Phase Readiness

- Trap extraction and durable adapter are ready for Phase 37's trap-first graph-plan compiler, which will consume the persisted graph documents
- The locked relation vocabulary (mitigates/requires/order/risk-blocks/co-occurs-with) with hard/soft strength is available for compilation
- The graph adapter is registered in the default adapter list and will be invoked on all approved trap lifecycle events

---
*Phase: 36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract*
*Completed: 2026-04-25*

## Self-Check: PASSED

All created and modified files verified present. All commits verified in git log (faf5f79, d0dbfaf, 87b7566). Full test suite green (556/556 tests pass).
