---
phase: 61-candidate-pipeline-independent-table
plan: 02
subsystem: database
tags: [dual-write, repository-pattern, postgresql, jsonb, candidates]

requires:
  - phase: 61-01
    provides: CandidateRepository interface and PgCandidateRepository implementation
provides:
  - DualWriteCandidateRepository for writing to both relational and JSONB
  - InMemoryCandidateRepository for JsonStore compatibility
  - createCandidateRepository factory function
  - Processor integration with conditional repository usage
affects: [62-dual-write-adapter, 63-jsonb-cleanup]

tech-stack:
  added: []
  patterns:
    - Dual-write pattern for database migration without downtime
    - Repository factory pattern with pool-based selection
    - Conditional fallback for backward compatibility

key-files:
  created:
    - packages/server/src/lib/candidates/repository.test.ts
  modified:
    - packages/server/src/lib/candidates/repository.ts
    - packages/server/src/lib/candidates/processor.ts
    - packages/server/src/lib/candidates/index.ts

key-decisions:
  - "Use dynamic require() for PgCandidateRepository to avoid loading pg module in test environments"
  - "Write to primary (PostgreSQL) first, then shadow to JSONB for data safety during transition"
  - "Keep fallback transact() path for JsonStore tests that don't provide pool"

patterns-established:
  - "Dual-write: primary-first then shadow write ensures relational data is authoritative"
  - "Factory pattern: createCandidateRepository() returns appropriate implementation based on pool availability"
  - "Conditional repository usage: processor checks candidateRepo availability before using direct operations"

requirements-completed:
  - WRITE-01

duration: 15min
completed: 2026-05-03
---

# Plan 61-02: Dual-Write Repository and Processor Integration Summary

**Wired DualWriteCandidateRepository into candidate processing pipeline, replacing transact() amplification with direct repository calls while maintaining JSONB shadow writes for transition compatibility**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-03T08:10:00Z
- **Completed:** 2026-05-03T08:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented DualWriteCandidateRepository that writes to both PgCandidateRepository and JSONB snapshot
- Implemented InMemoryCandidateRepository for JsonStore test compatibility
- Integrated CandidateRepository into processor with conditional fallback pattern
- Updated barrel exports to expose new repository modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement DualWriteCandidateRepository, InMemoryCandidateRepository, and factory function** - `3d2eac5` (feat)
2. **Task 2: Integrate CandidateRepository into processor and update barrel exports** - `c94f212` (feat)

## Files Created/Modified
- `packages/server/src/lib/candidates/repository.ts` - Added DualWriteCandidateRepository, InMemoryCandidateRepository, createCandidateRepository factory
- `packages/server/src/lib/candidates/repository.test.ts` - Tests for both repository implementations and factory
- `packages/server/src/lib/candidates/processor.ts` - Added candidateRepo field and conditional repository usage at all 6 transact() sites
- `packages/server/src/lib/candidates/index.ts` - Added barrel exports for repository.js and pg-repository.js

## Decisions Made
- Used dynamic require() for PgCandidateRepository to avoid importing pg module in test environments where it may not be available
- Primary-first write ordering ensures relational data is authoritative if shadow write fails
- Fallback transact() path preserved for JsonStore tests without pool

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**exactOptionalPropertyTypes TypeScript error:**
- **Issue:** Passing `error?: string` parameter to updateCandidateStatus() failed with exactOptionalPropertyTypes
- **Resolution:** Added conditional branch to pass error only when defined

## User Setup Required

None - no external service configuration required. The repository implementations work with existing PostgreSQL pool or JsonStore.

## Next Phase Readiness
- Dual-write infrastructure ready for production use
- Processor now uses direct repository operations when pool is available
- Plan 02 complete, ready for Plan 03 (if applicable) or next phase

---
*Phase: 61-candidate-pipeline-independent-table*
*Completed: 2026-05-03*
