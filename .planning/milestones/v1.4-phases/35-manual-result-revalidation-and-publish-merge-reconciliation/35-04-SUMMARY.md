---
wave: 4
phase: 35-manual-result-revalidation-and-publish-merge-reconciliation
plan: 04
subsystem: server
tags: [typescript, candidates, merge, lineage, provenance]

# Dependency graph
requires:
  - phase: 35-03
    provides: Publish functions and EntityLineageRecord interface
provides:
  - recordMergeLineage function for recording merge relationships
  - getLineageByCandidate for querying lineage by candidate
  - getLineageByTarget for querying lineage by target entity
  - getLineageById for looking up specific lineage records
affects: [35-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [merge lineage pattern, non-destructive merge, provenance tracking]

key-files:
  created: []
  modified:
    - packages/server/src/lib/candidates/reconcile.ts
    - packages/server/src/lib/candidates/reconcile.test.ts

key-decisions:
  - "Merge path records lineage without modifying existing entity content"
  - "Review notes are added to existing entities for audit trail"
  - "Lineage records use 'merged_into' relationshipType for merge decisions"

patterns-established:
  - "recordMergeLineage accepts args object with store, data, candidate, existingEntityId, existingEntityType, resolvedBy, resolvedAt, notes"
  - "Helper functions provide filtered views of entityLineage collection"
  - "Lineage records are pushed to entityLineage array in store"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-24
---

# Phase 35 Plan 04: Merge Path and Lineage Recording Summary

**Implemented merge path logic that records lineage relationships without modifying existing entity content**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-24T19:33:00Z
- **Completed:** 2026-04-24T19:36:00Z
- **Tasks:** 3
- **Files modified:** 2
- **Tests added:** 11

## Accomplishments
- Added recordMergeLineage function to create lineage with 'merged_into' relationship
- Added review notes to existing trap/skill entities for audit trail
- Ensured non-destructive merge (existing entity content not modified)
- Added getLineageByCandidate helper to query lineage by candidate ID
- Added getLineageByTarget helper to query lineage by target entity
- Added getLineageById helper to lookup specific lineage records
- Added comprehensive unit tests for all merge scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1 & 2: Add recordMergeLineage and lineage helper functions** - `bd70adb` (feat)
2. **Task 3: Add unit tests for merge functions** - `4ecb17f` (test)

## Files Created/Modified
- `packages/server/src/lib/candidates/reconcile.ts` - Added recordMergeLineage, getLineageByCandidate, getLineageByTarget, getLineageById functions
- `packages/server/src/lib/candidates/reconcile.test.ts` - Added 11 tests for merge functions (39 total reconcile tests)

## Decisions Made
- Merge path is non-destructive - only records relationship, does not merge content
- System-generated review notes added to existing entities for audit trail
- Lineage uses 'merged_into' relationshipType to distinguish from 'published_as'
- Helper functions provide filtered views of the entityLineage collection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tests pass (537 total tests, 39 reconcile tests).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Merge path ready for Phase 35-05 orchestrator function
- Lineage tracking helpers available for querying relationships
- All store functions for resolution workflow complete

---
*Phase: 35-manual-result-revalidation-and-publish-merge-reconciliation*
*Completed: 2026-04-24*
