---
phase: 100-store-repository-pattern
plan: 04
subsystem: api
tags: [repository-pattern, fastify, store-migration, auth]

requires:
  - phase: 100-store-repository-pattern
    provides: "SkillShareerRepos unified repos object, domain-specific repository interfaces"
provides:
  - "Route files migrated from store.snapshot/transact to repos method calls"
  - "resolveAuthContext always uses repos (no store fallback)"
  - "session.ts cleaned of conditional repo checks and store fallback paths"
affects: [100-store-repository-pattern]

tech-stack:
  added: []
  patterns: ["Repository pattern for route-level data access", "Unified repos object for auth context resolution"]

key-files:
  created: []
  modified:
    - packages/server/src/routes/feedback.ts
    - packages/server/src/routes/feedback-admin.ts
    - packages/server/src/routes/decay.ts
    - packages/server/src/routes/candidates.ts
    - packages/server/src/lib/session.ts
    - packages/server/src/lib/session.test.ts

key-decisions:
  - "Retained store.transact() where repository methods lack required capabilities (createCandidateSubmission needs nextId, applyManualResultResolution needs StoreData)"
  - "Retained store.transact()/snapshot() in decay batch endpoint because executeBatchOperation/planBatchOperation require StoreData directly"
  - "Removed store.snapshot() fallback in session.ts since repos is always populated in both JSON and PG modes"

patterns-established:
  - "Route handlers destructure repos at handler top: const { candidate, duplicate } = app.skillShareer.repos"
  - "Helper functions accept repos object instead of StoreData for entity lookups"

requirements-completed: []

duration: 25min
completed: 2026-05-07
---

# Phase 100 Plan 04: Migrate Routes and Session to Repos Summary

**Migrated 5 route/session files from direct store.snapshot()/transact() to repos method calls, eliminating conditional repo checks and store fallback in session.ts**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-07T11:05:00Z
- **Completed:** 2026-05-07T11:29:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- feedback.ts, feedback-admin.ts, decay.ts migrated to repos.feedback, repos.knowledge calls (Task 1)
- candidates.ts migrated to repos.candidate, repos.duplicate, repos.knowledge, repos.artifact calls (Task 2)
- session.ts resolveAuthContext, getSessionResponse, getSessionStatus always use repos (no store fallback)
- Removed conditional `if (sessionRepo && userRepo && ...)` checks and store.snapshot() fallback paths
- Removed unused findMembershipForTeam helper and 3 "falls back to store" tests
- All 311 tests pass (22 session + 289 route)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate feedback, feedback-admin, and decay routes** - `f224371` (feat)
2. **Task 2: Migrate candidates and session to use repos** - `d6c7df5` (feat)

## Files Created/Modified
- `packages/server/src/routes/feedback.ts` - Migrated from store.transact to repos.feedback (nextId, insert, listByFilter)
- `packages/server/src/routes/feedback-admin.ts` - Migrated from store.snapshot/transact to repos.feedback, repos.knowledge, repos.artifact
- `packages/server/src/routes/decay.ts` - Migrated list/search endpoints from store.snapshot to repos.knowledge.listByFilter
- `packages/server/src/routes/candidates.ts` - Migrated GET endpoints to repos.candidate/repos.duplicate; bundle endpoint to repos.knowledge/repos.artifact; manual-result to repos.candidate.attachManualResult
- `packages/server/src/lib/session.ts` - Removed store.snapshot() fallback in resolveAuthContext, getSessionResponse, getSessionStatus; always uses repos
- `packages/server/src/lib/session.test.ts` - Added repos to test helpers, removed 3 store fallback tests

## Decisions Made
- Retained store.transact() for POST /v1/candidates (createCandidateSubmission needs store.nextId for ID generation)
- Retained store.transact() for POST /v1/candidates/:candidateId/apply-resolution (applyManualResultResolution requires StoreData)
- Retained store.snapshot() callback in scheduleCandidateProcessing (processor needs current snapshot)
- Retained store.transact()/snapshot() in decay batch endpoint (executeBatchOperation/planBatchOperation require StoreData)
- Retained store.transact() in feedback-admin lifecycle triggers (decayMeta updates have no repo method)

## Deviations from Plan

### Accepted Deviations (documented in plan context)

**1. [Architectural] Retained store.transact() for operations requiring StoreData**
- **Found during:** Task 1 and Task 2
- **Issue:** Several operations (createCandidateSubmission, applyManualResultResolution, executeBatchOperation, planBatchOperation, decayMeta updates) require direct StoreData access that repositories don't provide
- **Fix:** Kept store.transact()/snapshot() for these specific operations while migrating all other data access to repos
- **Files affected:** candidates.ts (3 endpoints), decay.ts (batch endpoint), feedback-admin.ts (lifecycle triggers)
- **Verification:** All 311 tests pass

---

**Total deviations:** 5 accepted (all documented in plan interfaces context)
**Impact on plan:** Core migration complete. Remaining store access is for operations that inherently need StoreData (ID generation, batch mutations, decayMeta). No scope creep.

## Issues Encountered
None - plan executed smoothly.

## Known Stubs
None.

## Threat Flags
None - auth chain preserved through repos.session/repos.user/repos.team/repos.membership.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All high-consumer route files now use repos
- Remaining store.transact/snapshot usage is limited to operations that inherently need StoreData
- Ready for Phase 100 Plan 05 if applicable

## Self-Check: PASSED

- All 6 modified files exist
- Commits f224371 and d6c7df5 found in git log
- 311 tests pass (22 session + 289 route)

---
*Phase: 100-store-repository-pattern*
*Completed: 2026-05-07*
