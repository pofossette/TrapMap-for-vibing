---
phase: 50-batch-management-interface
plan: 01
subsystem: api
tags: [batch, decay, lifecycle, mutation, dry-run]

requires:
  - phase: 48-lifecycle-state-machine
    provides: computeDecayState, supersedeEntry, decay state schemas
  - phase: 49-freshness-decay
    provides: FreshnessType, decay configuration
provides:
  - Batch operation request/response schemas with Zod validation
  - planBatchOperation pure function for dry-run preview
  - executeBatchOperation for batch mutations with lifecycle events
  - Decay-aware list item schema for filtered listing
affects: [50-02, 50-03]

tech-stack:
  added: []
  patterns: [pure-function, dry-run-preview, eligibility-validation]

key-files:
  created:
    - packages/server/src/lib/decay/batch.ts
    - packages/server/src/lib/decay/batch.test.ts
  modified:
    - packages/contracts/src/domain/decay.ts

key-decisions:
  - "planBatchOperation returns eligibility status with reasons, not throwing on invalid entries"
  - "executeBatchOperation skips ineligible entries silently (only mutates eligible)"
  - "Supersede action delegates to existing supersedeEntry function"
  - "Lifecycle events use type='updated' for extend/mark-review, type='deactivated' for deactivate"

patterns-established:
  - "Pure planning function: planBatchOperation computes changes without mutation"
  - "Eligibility pattern: each entry gets eligible flag with ineligibilityReason when false"

requirements-completed: [DECAY-03]

duration: 15min
completed: 2026-05-02
---

# Plan 50-01: Batch Operation Contracts Summary

**Batch mutation contracts and pure functions for lifecycle management with dry-run support**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T19:40:00Z
- **Completed:** 2026-05-02T19:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added batch operation schemas to contracts (batchActionSchema, batchOperationRequestSchema, etc.)
- Implemented planBatchOperation for dry-run preview with eligibility validation
- Implemented executeBatchOperation for batch mutations with lifecycle events
- 36 comprehensive tests covering all actions and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add batch operation schemas to contracts** - `00f1be8` (feat)
2. **Task 2: Implement batch mutation pure functions with tests** - `9226139` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/decay.ts` - Added 6 new schemas and 7 type exports for batch operations
- `packages/server/src/lib/decay/batch.ts` - planBatchOperation and executeBatchOperation functions
- `packages/server/src/lib/decay/batch.test.ts` - 36 tests covering all batch operations

## Decisions Made
- planBatchOperation returns detailed eligibility status per entry rather than throwing on first invalid entry
- executeBatchOperation silently skips ineligible entries, allowing partial batch success
- Supersede action reuses existing supersedeEntry function for consistency
- Lifecycle events use 'updated' type for extend/mark-review, 'deactivated' for deactivate

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Worktree path confusion - initially edited files in /home/wunai/gsd-workspaces/decay-chain/ instead of the agent worktree. Files were correctly written to the decay-chain worktree which is the intended location.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Batch operation schemas ready for server routes (50-02)
- Pure functions ready for CLI commands (50-03)
- Test patterns established for route and CLI tests

---
*Phase: 50-batch-management-interface*
*Completed: 2026-05-02*
