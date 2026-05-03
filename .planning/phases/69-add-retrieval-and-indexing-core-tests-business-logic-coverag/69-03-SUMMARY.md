---
phase: 69-add-retrieval-and-indexing-core-tests-business-logic-coverag
plan: 03
subsystem: testing
tags: [vitest, fastify, auth, access-keys, integration-tests]

# Dependency graph
requires:
  - phase: 68
    provides: CI baseline restored, all existing tests passing
provides:
  - Integration tests for auth routes (login, session, logout, team selection)
  - Integration tests for access-keys route (key creation with permission checks)
affects: [phase-70, phase-71]

# Tech tracking
tech-stack:
  added: []
  patterns: [buildServer-inject-pattern, unique-data-file-per-test, bearer-token-auth-in-tests]

key-files:
  created:
    - packages/server/src/routes/auth.test.ts
    - packages/server/src/routes/access-keys.test.ts
  modified: []

key-decisions:
  - "Used separate buildServer instances for system admin key tests to isolate config"
  - "Created target user with lower security level (5) than admin caller (10) to satisfy requireHigherLevel check"

patterns-established:
  - "Separate buildServer() for tests that need special config (systemAdminKey)"
  - "Target membership with lower security level than caller for access key issuance tests"

requirements-completed: [TEST-02]

# Metrics
duration: 5min
completed: 2026-05-03
---

# Phase 69 Plan 03: Auth and Access-Keys Route Integration Tests Summary

**Fastify integration tests for auth routes (12 cases) and access-keys route (5 cases) using buildServer() + app.inject() with Bearer token auth**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-03T19:37:34Z
- **Completed:** 2026-05-03T19:42:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Auth route tests cover login (system admin key + access key), session status, logout, and team selection with success and failure paths
- Access-keys route tests cover key creation with member-not-found, team-mismatch, permission-denied, successful creation, and creation with notes
- All 17 tests pass using real Fastify inject() pattern (no mocks)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create routes/auth.test.ts** - `14f33fb` (test)
2. **Task 2: Create routes/access-keys.test.ts** - `c02aad4` (test)

## Files Created/Modified
- `packages/server/src/routes/auth.test.ts` - 12 integration tests for auth routes (login, session, logout, team selection)
- `packages/server/src/routes/access-keys.test.ts` - 5 integration tests for access-keys route (key creation)

## Decisions Made
- Used separate buildServer() instances for tests requiring systemAdminKey config to avoid polluting shared test state
- Created a separate target user with security level 5 (vs admin caller at 10) to satisfy the requireHigherLevel check in access-keys route

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed systemAdminKey test payloads failing Zod min(16) validation**
- **Found during:** Task 1 (auth.test.ts)
- **Issue:** Test payloads 'wrong-key-value' (15 chars) and 'any-key' (7 chars) were too short for loginRequestSchema which requires min(16) characters, resulting in 400 instead of expected 401/500
- **Fix:** Extended strings to pass Zod validation: 'wrong-key-value-xxxx' (20 chars) and 'any-key-at-least-16-chars' (24 chars)
- **Files modified:** packages/server/src/routes/auth.test.ts
- **Verification:** All 12 auth tests pass
- **Committed in:** 14f33fb (Task 1 commit)

**2. [Rule 1 - Bug] Fixed requireHigherLevel 403 in access-keys success tests**
- **Found during:** Task 2 (access-keys.test.ts)
- **Issue:** Both caller and target membership had securityLevel 10, causing requireHigherLevel to reject with 403 (requires strictly higher level)
- **Fix:** Created a separate target user with securityLevel 5 while keeping admin caller at 10
- **Files modified:** packages/server/src/routes/access-keys.test.ts
- **Verification:** All 5 access-keys tests pass
- **Committed in:** c02aad4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 69 (governance and auth route tests) is now complete with all 3 plans done
- TEST-02 requirement satisfied
- Ready for Phase 70 (retrieval and indexing core tests)

## Self-Check: PASSED

- FOUND: packages/server/src/routes/auth.test.ts
- FOUND: packages/server/src/routes/access-keys.test.ts
- FOUND: 69-03-SUMMARY.md
- FOUND: commit 14f33fb (Task 1)
- FOUND: commit c02aad4 (Task 2)

---
*Phase: 69-add-retrieval-and-indexing-core-tests-business-logic-coverag*
*Completed: 2026-05-03*
