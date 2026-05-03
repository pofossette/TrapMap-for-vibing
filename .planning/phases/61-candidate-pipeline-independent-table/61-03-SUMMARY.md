---
phase: 61-candidate-pipeline-independent-table
plan: 03
subsystem: database
tags: [migration, postgresql, backfill, candidates, idempotent]

requires:
  - phase: 61-candidate-pipeline-independent-table
    provides: PgCandidateRepository with insert() and getById() methods
provides:
  - migrateCandidates() function for one-time JSONB to relational table migration
  - MigrationConfig/MigrationResult interfaces for migration control and reporting
  - Dry-run mode for migration verification
  - Progress callback for large dataset monitoring
affects: [62-dual-write-adapter]

tech-stack:
  added: []
  patterns:
    - Idempotent migration with getById() check before insert
    - Error-tolerant processing with recorded errors and continued execution
    - Progress reporting callback pattern

key-files:
  created:
    - packages/server/src/lib/persistence/migrate-candidates.ts
    - packages/server/src/lib/persistence/migrate-candidates.test.ts
  modified: []

key-decisions:
  - "Use PgCandidateRepository directly (not DualWriteCandidateRepository) because during migration data is read FROM JSONB and written TO relational table"
  - "Progress callback called outside try/catch to ensure it's invoked even on errors"

patterns-established:
  - "Migration function follows backfill-indexes.ts pattern: Config/Result interfaces, dry-run mode, onProgress callback"
  - "Error collection without throwing - records errors and continues processing remaining candidates"

requirements-completed:
  - WRITE-01

duration: 8min
completed: 2026-05-03
---

# Plan 61-03: Candidate Migration Script Summary

**Created migrateCandidates() function for one-time backfill of candidate data from JSONB snapshot to relational candidates table with idempotency, dry-run mode, and error-tolerant processing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-03T08:13:00Z
- **Completed:** 2026-05-03T08:21:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created migrateCandidates() function following established backfill-indexes.ts pattern
- Implemented idempotent migration with getById() check before insert
- Added dry-run mode for verification before actual migration
- Implemented error-tolerant processing that records errors and continues
- Added progress callback for monitoring large dataset migrations

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement candidate migration script and tests** - `38ff2ed` (feat)

## Files Created/Modified
- `packages/server/src/lib/persistence/migrate-candidates.ts` - Migration script with migrateCandidates() function
- `packages/server/src/lib/persistence/migrate-candidates.test.ts` - Tests for migration script

## Decisions Made
- Used PgCandidateRepository directly (not DualWriteCandidateRepository) because during migration the data is being read FROM JSONB and written TO the relational table - dual-write would try to write back to JSONB which is redundant
- Progress callback is called outside the try/catch block to ensure it's invoked even when processing errors occur

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Test: onProgress callback not called on error**
- **Issue:** Initial implementation had onProgress callback inside try block, so it wasn't called when insert() threw
- **Fix:** Moved onProgress callback outside try/catch to ensure it's always called
- **Files modified:** packages/server/src/lib/persistence/migrate-candidates.ts
- **Verification:** Test "should call onProgress even when errors occur" now passes

## User Setup Required

None - no external service configuration required. The migration script uses existing PgCandidateRepository which handles table creation via ensureSchema().

## Next Phase Readiness
- Migration script ready for deployment use
- Supports dry-run mode for verification before actual migration
- Ready for integration with deployment scripts or CLI command

---
*Phase: 61-candidate-pipeline-independent-table*
*Completed: 2026-05-03*
