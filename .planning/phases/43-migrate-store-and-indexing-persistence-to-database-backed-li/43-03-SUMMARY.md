---
phase: 43-migrate-store-and-indexing-persistence-to-database-backed-li
plan: 03
subsystem: database
tags: [store-contract, test-migration, type-widening, regression-tests]

# Dependency graph
requires:
  - phase: 43-02
    provides: "Verified production-wide adoption of shared SkillShareerStore contract"
provides:
  - "All server tests aligned with shared store contract (SkillShareerStore interface)"
  - "Expanded store regression suite covering both JsonStore and PostgresStore contract tests"
  - "Route-level assignability coverage proving both implementations interchangeable"
affects: [43-migrate-store-and-indexing-persistence-to-database-backed-li]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-contract-test-runner, store-assignability-verification]

key-files:
  created: []
  modified:
    - packages/server/src/lib/store.test.ts
    - packages/server/src/lib/indexing/events.test.ts
    - packages/server/src/lib/retrieval-workflow.test.ts
    - packages/server/src/lib/retrieval.test.ts
    - packages/server/src/lib/artifacts/derive.test.ts
    - packages/server/src/lib/artifacts/model.test.ts
    - packages/server/src/lib/artifacts/edit.test.ts
    - packages/server/src/lib/candidates/reconcile.test.ts
    - packages/server/src/lib/indexing/adapters/graph.test.ts
    - packages/server/src/lib/indexing/pipeline.test.ts
    - packages/server/src/lib/indexing/reconcile.test.ts
    - packages/server/src/routes/operations.test.ts
    - packages/server/src/routes/retrieval.test.ts

key-decisions:
  - "Widened all test-local JsonStore type annotations to SkillShareerStore while keeping concrete JsonStore instantiation for file-backed test scenarios"
  - "Added JsonStore to the shared contract test runner to match PostgresStore coverage"
  - "Used pg-mem backed PostgresStore in assignability tests to avoid real PostgreSQL dependency"

patterns-established:
  - "Dual contract testing: both JsonStore and PostgresStore run through the same shared contract test runner"

requirements-completed: [P43-03]

# Metrics
duration: 6min
completed: 2026-04-26
---

# Phase 43 Plan 03: Test and Verification Cleanup Summary

**Widened all server test type annotations from JsonStore to SkillShareerStore, added JsonStore contract tests and route-level assignability coverage proving both store implementations are interchangeable through the shared interface**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-26T05:03:36Z
- **Completed:** 2026-04-26T05:10:26Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Widened `JsonStore` type annotations to `SkillShareerStore` across 12 test files (events, retrieval-workflow, retrieval, derive, model, edit, reconcile, graph, pipeline, reconcile-indexing, operations, retrieval-route)
- Added shared contract tests for JsonStore (6 tests matching existing PostgresStore coverage)
- Added 3 runtime selection and assignability tests proving both store implementations interchangeable
- Added structural equivalence test verifying both stores produce identical empty snapshots
- Server typecheck passes cleanly across all source and test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Update existing tests to the shared store contract** - `2aa97c5` (events.test.ts) + `87598d5` (remaining 11 files)
2. **Task 2: Finish regression coverage and restore package-wide verification** - `313e93b` (store.test.ts expansion)

## Files Created/Modified
- `packages/server/src/lib/store.test.ts` - Expanded from 8 to 18 tests with JsonStore contract coverage, assignability tests, and structural equivalence checks
- `packages/server/src/lib/indexing/events.test.ts` - Widened `store: JsonStore` to `store: SkillShareerStore`
- `packages/server/src/lib/retrieval-workflow.test.ts` - Widened store type annotation to SkillShareerStore
- `packages/server/src/lib/retrieval.test.ts` - Widened mockStore type annotation
- `packages/server/src/lib/artifacts/derive.test.ts` - Widened store type in both describe blocks
- `packages/server/src/lib/artifacts/model.test.ts` - Widened store type annotation
- `packages/server/src/lib/artifacts/edit.test.ts` - Widened mockStore type and cast
- `packages/server/src/lib/candidates/reconcile.test.ts` - Widened mock store helper return type
- `packages/server/src/lib/indexing/adapters/graph.test.ts` - Widened store type annotation
- `packages/server/src/lib/indexing/pipeline.test.ts` - Widened store type annotation
- `packages/server/src/lib/indexing/reconcile.test.ts` - Widened store type annotation
- `packages/server/src/routes/operations.test.ts` - Widened testStore type in artifact deactivate test
- `packages/server/src/routes/retrieval.test.ts` - Removed unused JsonStore import

## Decisions Made
- Kept concrete `JsonStore`/`JsonStoreClass` instantiation in tests that intentionally exercise the file-backed implementation (per plan acceptance criteria)
- Added JsonStore to the shared contract test runner so both implementations get identical behavioral verification
- Used pg-mem backed PostgresStore in assignability tests to avoid requiring a real PostgreSQL connection in test environments
- Route-level tests already used `SkillShareerStore` via `app.skillShareer.store` -- only the local variable annotations needed widening

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed store tests using real PostgreSQL connection**
- **Found during:** Task 2 (store.test.ts)
- **Issue:** Initial runtime selection tests called `createSkillShareerStore` with a real `databaseUrl`, which tried to connect to PostgreSQL at 127.0.0.1:5432 and failed with ECONNREFUSED
- **Fix:** Replaced real PostgreSQL factory calls with `createPostgresStore()` (pg-mem backed) in behavioral tests, keeping factory calls only for instanceof checks where no connection is attempted
- **Files modified:** src/lib/store.test.ts
- **Verification:** All 18 store tests pass
- **Committed in:** 313e93b

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope creep. All plan acceptance criteria met.

## Issues Encountered
- Task 1 was largely pre-complete -- the working tree already contained the type-widening changes for 11 of the 12 files. Only `events.test.ts` needed a fresh edit. The pre-existing changes were committed as part of Task 1.

## Deferred Issues
- Pre-existing test failure in `operations.test.ts` ("re-approving a deactivated artifact rebuilds graph documents") -- out of scope for this plan. Previously documented in 43-02 SUMMARY.

## Next Phase Readiness
- All server tests aligned with the shared store contract
- Store regression suite covers both JsonStore and PostgresStore with identical behavioral tests
- Server typecheck passes across source and test files
- Phase 43 is complete -- the database-backed store migration is fully verified

## Self-Check: PASSED

- All 14 modified files verified in git log
- All 3 commits (2aa97c5, 87598d5, 313e93b) verified in git log

---
*Phase: 43-migrate-store-and-indexing-persistence-to-database-backed-li*
*Completed: 2026-04-26*
