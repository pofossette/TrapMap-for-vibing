---
phase: 61-candidate-pipeline-independent-table
plan: 01
subsystem: database
tags: [drizzle, postgresql, repository-pattern, row-level-locking, candidates]

requires:
  - phase: 43-postgres-store
    provides: PostgreSQL persistence pattern with Pool and drizzle ORM
provides:
  - candidates Drizzle table schema with 17 columns
  - CandidateRepository interface with 8 async CRUD methods
  - PgCandidateRepository implementation with SELECT FOR UPDATE locking
affects: [62-dual-write-adapter, 63-jsonb-cleanup]

tech-stack:
  added: []
  patterns:
    - Repository pattern abstracting JSONB vs relational storage
    - Row-level locking via SELECT FOR UPDATE for concurrent safety
    - ensureSchema idempotent table creation pattern

key-files:
  created:
    - packages/server/src/lib/candidates/repository.ts
    - packages/server/src/lib/candidates/pg-repository.ts
    - packages/server/src/lib/candidates/pg-repository.test.ts
    - packages/server/src/lib/persistence/__tests__/schema-candidates.test.ts
    - packages/server/src/lib/candidates/__tests__/repository-interface.test.ts
  modified:
    - packages/server/src/lib/persistence/schema.ts

key-decisions:
  - "Use Drizzle ORM for type-safe schema definition and simple queries"
  - "Use raw SQL via pool.query() for complex updates with SELECT FOR UPDATE"
  - "Store duplicateCase as JSONB column on candidate row (1:1 relationship)"
  - "Create indexes via ensureSchema() raw SQL, not Drizzle schema callback"

patterns-established:
  - "Repository interface defining CRUD operations before implementation"
  - "ensureSchema() idempotent initialization with `initialized` flag"
  - "Transaction pattern: pool.connect() + BEGIN + FOR UPDATE + UPDATE + COMMIT + finally release"

requirements-completed:
  - WRITE-01

duration: 12min
completed: 2026-05-03
---

# Plan 61-01: Candidates Table Schema and Repository Summary

**Established candidates table schema with Drizzle ORM and PgCandidateRepository with row-level SELECT FOR UPDATE locking for concurrent-safe candidate processing**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-03T07:55:08Z
- **Completed:** 2026-05-03T08:07:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created candidates Drizzle table schema with 17 columns matching CandidateSubmission fields
- Defined CandidateRepository interface with 8 async methods for CRUD abstraction
- Implemented PgCandidateRepository with SELECT FOR UPDATE for row-level locking
- Added ensureSchema() pattern for idempotent table/index creation

## Task Commits

Each task was committed atomically:

1. **Task 1: Define candidates table schema and CandidateRepository interface** - `e9c5c79` (feat)
2. **Task 2: Implement PgCandidateRepository with row-level locking** - `19106c7` (feat)

## Files Created/Modified
- `packages/server/src/lib/persistence/schema.ts` - Added candidates pgTable with 17 columns
- `packages/server/src/lib/candidates/repository.ts` - CandidateRepository interface with 8 methods
- `packages/server/src/lib/candidates/pg-repository.ts` - PgCandidateRepository implementation
- `packages/server/src/lib/candidates/pg-repository.test.ts` - Unit tests for repository
- `packages/server/src/lib/persistence/__tests__/schema-candidates.test.ts` - Schema structure tests
- `packages/server/src/lib/candidates/__tests__/repository-interface.test.ts` - Interface contract tests

## Decisions Made
- Used Drizzle ORM for schema definition and simple queries (insert, select)
- Used raw SQL for complex updates requiring SELECT FOR UPDATE locking
- Stored duplicateCase as JSONB column on candidate row (1:1 relationship, no separate table)
- Created indexes via ensureSchema() raw SQL, matching task-queue.ts pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Drizzle type inference mismatch:**
- **Issue:** Drizzle's `.select()` returns type with Date properties but manual `DrizzleCandidateRow` interface used incompatible type
- **Resolution:** Cast the result to `DrizzleCandidateRow` type in `getById()` and `listByStatus()` to satisfy TypeScript

## User Setup Required

None - no external service configuration required. The candidates table is created automatically by `ensureSchema()` on first repository operation.

## Next Phase Readiness
- Candidates table schema ready for dual-write adapter (Plan 02)
- PgCandidateRepository ready for integration into processor.ts
- Repository interface enables DualWriteCandidateRepository wrapper

---
*Phase: 61-candidate-pipeline-independent-table*
*Completed: 2026-05-03*
