---
phase: 102-indexadapter-generalization-and-retrieval-plugin-dynamic-ada
plan: 01
subsystem: indexing
tags: [registry-pattern, adapter, typescript, pipeline]

requires:
  - phase: none
    provides: baseline indexing pipeline
provides:
  - AdapterRegistry class with register/get/all/kinds/has API
  - Generalized IndexAdapter.kind as string (not fixed union)
  - Dynamic KnowledgeIndexStateRecord.adapters map with backward-compat deprecated fields
  - Pipeline migrated from hardcoded array to registry.all() iteration
  - Old-format indexState migration on read
affects: [102-02, 102-03, retrieval-plugin]

tech-stack:
  added: []
  patterns: [Map-based registry pattern, backward-compat deprecated fields with @deprecated JSDoc]

key-files:
  created:
    - packages/server/src/lib/indexing/registry.ts
    - packages/server/src/lib/indexing/registry.test.ts
  modified:
    - packages/server/src/lib/indexing/types.ts
    - packages/server/src/lib/indexing/pipeline.ts
    - packages/server/src/lib/indexing/adapters/index.ts
    - packages/server/src/lib/indexing/events.ts
    - packages/server/src/lib/lifecycle/subscribers/indexing.ts
    - packages/server/src/lib/indexing/adapters/vector.ts
    - packages/server/src/lib/indexing/adapters/keyword.ts
    - packages/server/src/lib/context.ts
    - packages/server/src/app.ts
    - packages/server/src/lib/persistence/backfill-indexes.ts

key-decisions:
  - "AdapterRegistry uses Map<string, IndexAdapter> preserving insertion order for sequential pipeline semantics"
  - "KnowledgeIndexStateRecord.adapters is Record<string, AdapterSyncState>; deprecated vector/keyword/graph fields kept as optional"
  - "Old-format indexState migrated on read in syncKnowledgeIndex when adapters map is missing"
  - "buildDefaultAdapterRegistry and buildHybridAdapterRegistry added; old array-returning functions marked @deprecated"

patterns-established:
  - "Registry pattern: Map-based typed registry with duplicate detection, insertion-order preservation"
  - "Backward-compat migration: detect old format, populate new adapters map, keep deprecated fields optional"

requirements-completed: []

duration: 32min
completed: 2026-05-07
---

# Phase 102 Plan 01: IndexAdapter Registry Generalization Summary

**AdapterRegistry with dynamic string-based kind replacing hardcoded vector/keyword/graph union types in the indexing pipeline**

## Performance

- **Duration:** 32 min
- **Started:** 2026-05-07T01:02:27Z
- **Completed:** 2026-05-07T01:34:46Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Created AdapterRegistry class with register/get/all/kinds/has API and 8 unit tests
- Generalized IndexAdapter.kind and IndexSyncResult.adapterKind from fixed union to string
- Changed KnowledgeIndexStateRecord to use dynamic adapters: Record<string, AdapterSyncState> map
- Migrated pipeline, events, subscriber, and adapter builders to use AdapterRegistry
- Added old-format indexState migration for backward compatibility with existing JSON store data
- All 2769 tests pass, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AdapterRegistry and generalize indexing types** - `59a8a66` (test)
2. **Task 2: Migrate pipeline, adapters, events, and subscriber to use AdapterRegistry** - `64df6f9` (feat)

## Files Created/Modified
- `packages/server/src/lib/indexing/registry.ts` - AdapterRegistry class with Map-based registry
- `packages/server/src/lib/indexing/registry.test.ts` - 8 unit tests for AdapterRegistry
- `packages/server/src/lib/indexing/types.ts` - Generalized IndexAdapter.kind, IndexSyncResult.adapterKind, KnowledgeIndexStateRecord
- `packages/server/src/lib/indexing/pipeline.ts` - Migrated to registry.all() iteration with old-format migration
- `packages/server/src/lib/indexing/adapters/index.ts` - Added buildDefaultAdapterRegistry/buildHybridAdapterRegistry
- `packages/server/src/lib/indexing/events.ts` - Changed runKnowledgeIndexEvent to accept AdapterRegistry
- `packages/server/src/lib/lifecycle/subscribers/indexing.ts` - Changed createIndexingSubscriber to accept AdapterRegistry
- `packages/server/src/lib/indexing/adapters/vector.ts` - Updated to use adapters map
- `packages/server/src/lib/indexing/adapters/keyword.ts` - Updated to use adapters map
- `packages/server/src/lib/context.ts` - Changed indexAdapters type to AdapterRegistry
- `packages/server/src/app.ts` - Uses buildDefaultAdapterRegistry()
- `packages/server/src/lib/persistence/backfill-indexes.ts` - Uses buildHybridAdapterRegistry()

## Decisions Made
- AdapterRegistry uses Map<string, IndexAdapter> preserving insertion order for sequential pipeline semantics
- KnowledgeIndexStateRecord.adapters is Record<string, AdapterSyncState>; deprecated vector/keyword/graph fields kept as optional with @deprecated JSDoc
- Old-format indexState migrated on read in syncKnowledgeIndex when adapters map is missing
- buildDefaultAdapterRegistry and buildHybridAdapterRegistry added; old array-returning functions marked @deprecated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed old-format indexState migration**
- **Found during:** Task 2
- **Issue:** Existing entries in tests had old-format indexState without adapters map, causing pipeline to fail
- **Fix:** Added migration logic in syncKnowledgeIndex to detect old format and populate adapters map
- **Files modified:** packages/server/src/lib/indexing/pipeline.ts
- **Verification:** All 2769 tests pass
- **Committed in:** 64df6f9

**2. [Rule 3 - Blocking] Updated callers outside plan scope**
- **Found during:** Task 2
- **Issue:** app.ts, backfill-indexes.ts, context.ts, and test fixtures used old IndexAdapter[] type
- **Fix:** Updated all callers to use AdapterRegistry
- **Files modified:** app.ts, backfill-indexes.ts, context.ts, graph-fixtures.ts, 6 test files
- **Verification:** Typecheck passes, all tests pass
- **Committed in:** 64df6f9

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. Updated callers that were implicitly affected by the type change. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AdapterRegistry is available for 102-02 (ChannelRegistry) and 102-03 (StrategyRegistry) to follow the same pattern
- Indexing subsystem fully generalized; new adapters can register with any string kind

---
*Phase: 102-indexadapter-generalization-and-retrieval-plugin-dynamic-ada*
*Completed: 2026-05-07*
