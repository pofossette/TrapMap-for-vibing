---
phase: 34-builtin-duplicate-job-fetch-command-and-manual-result-intake
plan: 03
subsystem: candidates
tags: [routes, endpoints, duplicate-detection, manual-review, fastify]

# Dependency graph
requires:
  - phase: 34
    plan: 01
    provides: DuplicateJobBundleResponse, ManualResultSubmission types from contracts
  - phase: 34
    plan: 02
    provides: attachManualResult store function and ManualResultRecord type
provides:
  - GET /v1/duplicates/:candidateId/bundle endpoint for offline review
  - POST /v1/candidates/:candidateId/manual-result endpoint for manual decisions
affects: [phase-35]

# Tech tracking
tech-stack:
  added: []
  patterns: [fastify route handlers with zod validation, entity builders for bundle response]

key-files:
  created: []
  modified:
    - packages/server/src/routes/candidates.ts
    - packages/server/src/app.ts
    - packages/server/src/lib/candidates/store.ts
    - packages/server/src/lib/user-ops-log.ts

key-decisions:
  - "Bundle endpoint includes full entity data for traps and skills to support offline review without additional API calls"
  - "Manual result endpoint validates candidate is in duplicate_detected status before accepting decision"
  - "nextState is computed client-side and returned in response; actual state transition deferred to Phase 35"

patterns-established:
  - "Helper functions build entity data from store snapshot for bundle response"
  - "Manual result intake validates mergedWith requirement when decision is 'merged'"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-04-24
---

# Phase 34 Plan 03: Add Duplicate Job Bundle and Manual Result Endpoints Summary

**Added server endpoints for duplicate job bundle fetch and manual result submission, enabling offline review workflows for duplicate candidate resolution.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-24T10:45:00Z
- **Completed:** 2026-04-24T11:00:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added GET /v1/duplicates/:candidateId/bundle endpoint with full entity data for offline review
- Added POST /v1/candidates/:candidateId/manual-result endpoint for reviewer decisions
- Added helper functions buildTrapEntity and buildSkillEntity for bundle construction
- Added 'manual-result' action to UserOpsAction type for audit logging
- Fixed store.ts to properly initialize manualResult field on candidate creation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bundle endpoint for duplicate job** - `91e6749` (feat)
2. **Task 2: Add manual result intake endpoint** - `f59a833` (feat) - included store fixes and user-ops-log update
3. **Task 3: Register endpoints in documented routes** - `25bfb91` (feat)

## Files Created/Modified

- `packages/server/src/routes/candidates.ts` - Added bundle and manual-result endpoints with helper functions
- `packages/server/src/app.ts` - Added routes to documentedRoutes array
- `packages/server/src/lib/candidates/store.ts` - Added manualResult: null to createCandidateSubmission, fixed typing
- `packages/server/src/lib/user-ops-log.ts` - Added 'manual-result' to UserOpsAction type

## Decisions Made

- Bundle endpoint returns full entity data (trap/skill fields) to support offline review without additional lookups
- nextState is computed immediately but actual status transition deferred to Phase 35
- Used proper schema imports (DuplicateJobBundleResponseSchema, ManualResultSubmissionSchema) matching contracts naming

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed manualResult field initialization**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** createCandidateSubmission was missing manualResult field, causing TS error since CandidateSubmission type requires it
- **Fix:** Added manualResult: null to the candidate object initialization
- **Files modified:** packages/server/src/lib/candidates/store.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** f59a833 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added manual-result to UserOpsAction type**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** 'manual-result' was not a valid UserOpsAction, causing TS error
- **Fix:** Added 'manual-result' to the UserOpsAction union type
- **Files modified:** packages/server/src/lib/user-ops-log.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** f59a833 (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed schema import names**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Used lowercase schema names (duplicateJobBundleResponseSchema) but contracts exports use PascalCase (DuplicateJobBundleResponseSchema)
- **Fix:** Corrected import names to match contracts exports
- **Files modified:** packages/server/src/routes/candidates.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 91e6749 (Task 1 commit)

**4. [Rule 3 - Blocking] Fixed nextState variable initialization**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Variable 'nextState' used before being assigned because assignment was inside transact callback
- **Fix:** Moved nextState assignment outside transact callback since it only depends on body.decision
- **Files modified:** packages/server/src/routes/candidates.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 91e6749 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 missing critical, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correct TypeScript compilation. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in server package (unrelated to this plan - defaultPolicy enum mismatches in test files, various test file issues) prevent full server build, but new code compiles successfully

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Bundle and manual result endpoints ready for CLI integration
- Manual result storage working with candidate records
- Ready for Phase 35 (manual result revalidation and publish merge reconciliation)

---
*Phase: 34-builtin-duplicate-job-fetch-command-and-manual-result-intake*
*Completed: 2026-04-24*
