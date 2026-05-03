---
phase: 59-ownership-verification-sla-management
plan: 03
subsystem: cli, testing
tags: [cli, maintenance, vitest, commander, batch, integration-test]

# Dependency graph
requires:
  - 59-01 (maintenance contracts and store types)
  - 59-02 (server maintenance model, batch, routes)
provides:
  - maintenance-list, maintenance-assign, maintenance-verify CLI commands
  - Unit tests for maintenance model helpers (isReviewOverdue, isStaleVerification, etc.)
  - Unit tests for maintenance batch operations (plan and execute)
  - Route integration tests for GET/POST maintenance endpoints
  - Boolean query param coercion fix in maintenanceEntryListRequestSchema
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [CLI commands following decay.ts pattern with formatMaintenanceList/formatMaintenanceBatch, route integration tests with createTestEntry helper]

key-files:
  created:
    - packages/cli/src/commands/maintenance.ts
    - packages/server/src/lib/maintenance/model.test.ts
    - packages/server/src/lib/maintenance/batch.test.ts
    - packages/server/src/routes/maintenance.test.ts
  modified:
    - packages/cli/src/index.ts
    - packages/contracts/src/domain/maintenance.ts

key-decisions:
  - "CLI maintenance commands mirror decay.ts pattern exactly: same import structure, same formatter pattern, same command registration flow"
  - "Boolean query params use z.preprocess to coerce string 'true' from query strings to boolean true"
  - "Route integration tests use createTestEntry helper with any-cast for decayMeta since KnowledgeRecord type does not include it (pre-existing issue)"

patterns-established:
  - "CLI batch commands follow: loadCliState -> requireSessionToken -> build body/params -> apiRequest -> schema.parse -> printResult"

requirements-completed: [MAINT-01, MAINT-02]

# Metrics
duration: 10min
completed: 2026-05-03
---

# Phase 59 Plan 03: CLI Maintenance Commands and Tests Summary

**CLI maintenance commands (list, assign, verify) with comprehensive test coverage for model helpers, batch operations, and route handlers**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-03T03:06:00Z
- **Completed:** 2026-05-03T03:16:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created three CLI commands: maintenance-list (filtered listing), maintenance-assign (batch owner assignment), maintenance-verify (mark verified with review extension)
- Added 37 tests across model (11), batch (13), and route (13) test files - all passing
- Fixed boolean query param coercion in maintenanceEntryListRequestSchema for proper query string handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CLI maintenance commands and register** - `ac9dbfa` (feat)
2. **Task 2: Create tests for maintenance model, batch, and routes** - `abe46eb` (test)

## Files Created/Modified
- `packages/cli/src/commands/maintenance.ts` - Three CLI commands (maintenance-list, maintenance-assign, maintenance-verify) with formatters
- `packages/cli/src/index.ts` - Added registerMaintenanceCommands import and registration call
- `packages/server/src/lib/maintenance/model.test.ts` - 11 tests for isReviewOverdue, isStaleVerification, computeDefaultReviewBy, validateMaintenanceMeta
- `packages/server/src/lib/maintenance/batch.test.ts` - 13 tests for plan/execute of assign-owner, extend-review, mark-verified actions
- `packages/server/src/routes/maintenance.test.ts` - 13 integration tests for GET filtering, POST batch, auth, dry-run
- `packages/contracts/src/domain/maintenance.ts` - Fixed boolean query param coercion for missingOwner, reviewOverdue, staleVerification

## Decisions Made
- CLI commands follow the decay.ts pattern exactly for consistency across the operations CLI surface
- Boolean query params use z.preprocess with `(val) => val === 'true' || val === true` to handle both query string ("true") and programmatic (true) inputs
- Test helpers use `any` cast for entries with decayMeta since KnowledgeRecord type does not include decayMeta (same pre-existing issue as decay module)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Boolean query params fail validation in maintenanceEntryListRequestSchema**
- **Found during:** Task 2 (route integration tests for GET endpoints)
- **Issue:** Fastify parses query string booleans as strings ("true"), but schema used `z.boolean().optional()` which rejects string values, causing 400 errors
- **Fix:** Changed missingOwner, reviewOverdue, staleVerification fields to use `z.preprocess((val) => val === 'true' || val === true, z.boolean().optional())` for coercion
- **Files modified:** packages/contracts/src/domain/maintenance.ts
- **Verification:** All 4 previously failing route tests now pass
- **Committed in:** abe46eb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix necessary for route functionality. No scope creep.

## Issues Encountered
- Pre-existing server typecheck errors (113 total) from evidence/decay modules are unrelated to this plan's changes
- Pre-existing evidence/model.test.ts and rerank.test.ts test failures (20 tests) are unrelated to this plan's changes
- Worktree required `pnpm install --ignore-scripts` and `pnpm --filter @trapmap/contracts build` before typecheck/test could succeed (standard worktree setup)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 59 is complete: contracts (Plan 01), server module (Plan 02), CLI commands and tests (Plan 03) all delivered
- Maintenance commands ready for end-to-end CLI usage
- All 37 new tests passing, providing coverage for model helpers, batch operations, and route handlers

---
*Phase: 59-ownership-verification-sla-management*
*Completed: 2026-05-03*

## Self-Check: PASSED

- All 6 created/modified files verified present
- Both task commits verified in git log (ac9dbfa, abe46eb)
- All 37 maintenance tests pass (model: 11, batch: 13, routes: 13)
- No new typecheck errors beyond pre-existing decayMeta issue
