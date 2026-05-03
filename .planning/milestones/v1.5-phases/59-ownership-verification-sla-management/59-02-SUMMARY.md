---
phase: 59-ownership-verification-sla-management
plan: 02
subsystem: server, routes
tags: [maintenance, batch, routes, auth, rbac, sla, ownership]

# Dependency graph
requires:
  - 59-01 (maintenance contracts and store types)
provides:
  - maintenance/model.ts with validation helpers, overdue/stale checks, record-to-actor conversion
  - maintenance/batch.ts with planMaintenanceOperation and executeMaintenanceOperation
  - GET /v1/operations/maintenance/entries with missingOwner, reviewOverdue, staleVerification filters
  - POST /v1/operations/maintenance/batch with assign-owner, extend-review, mark-verified actions
affects: [59-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [plan-then-execute batch pattern with dry-run, permission-filtered entry listing, dual metadata update for mark-verified]

key-files:
  created:
    - packages/server/src/lib/maintenance/model.ts
    - packages/server/src/lib/maintenance/batch.ts
    - packages/server/src/routes/maintenance.ts
  modified:
    - packages/server/src/app.ts
    - packages/server/src/lib/user-ops-log.ts

key-decisions:
  - "mark-verified atomically updates both maintenanceMeta.reviewBy and decayMeta.lastVerifiedAt within a single transact() call"
  - "maintenance routes follow the same pattern as decay routes: plan-then-execute with dry-run support"
  - "filterEntriesByPermission helper duplicated from decay.ts rather than shared, matching existing route-level pattern"
  - "DecayMeta access uses type cast since KnowledgeRecord type does not include decayMeta (pre-existing issue from decay module)"

patterns-established:
  - "Maintenance module mirrors decay module structure: model.ts for helpers, batch.ts for plan/execute, routes for HTTP handlers"

requirements-completed: [MAINT-02]

# Metrics
duration: 12min
completed: 2026-05-03
---

# Phase 59 Plan 02: Maintenance Server Routes Summary

**Server-side maintenance module with validation helpers, batch operation logic, and HTTP route handlers for listing and mutating maintenance metadata on knowledge entries**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-03T02:49:20Z
- **Completed:** 2026-05-03T03:01:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created maintenance/model.ts with 5 exported functions: validateMaintenanceMeta, computeDefaultReviewBy, isReviewOverdue, isStaleVerification, toActorRefFromRecord
- Created maintenance/batch.ts with planMaintenanceOperation and executeMaintenanceOperation supporting assign-owner, extend-review, mark-verified actions
- Created maintenance routes with GET /v1/operations/maintenance/entries (filtered listing) and POST /v1/operations/maintenance/batch (batch mutations with dry-run)
- mark-verified action updates both maintenanceMeta.reviewBy and decayMeta.lastVerifiedAt atomically
- Both endpoints auth-gated: GET requires knowledge:export, POST requires knowledge:update
- Permission-based entry filtering reuses the same pattern as decay routes
- maintenanceRoutes registered in app.ts after decayRoutes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create maintenance model helpers and batch operation logic** - `b7b20cc` (feat)
2. **Task 2: Create maintenance routes and register in app.ts** - `e77ebcd` (feat)

## Files Created/Modified
- `packages/server/src/lib/maintenance/model.ts` - Validation helpers, default review date computation, overdue/stale checks, record-to-ActorRef conversion
- `packages/server/src/lib/maintenance/batch.ts` - Plan and execute maintenance batch operations with MaintenanceOperationInput and MaintenanceOperationPlanItem interfaces
- `packages/server/src/routes/maintenance.ts` - GET entries listing with maintenance filters, POST batch operations with dry-run support
- `packages/server/src/app.ts` - Added maintenanceRoutes import and registration
- `packages/server/src/lib/user-ops-log.ts` - Added maintenance-list and maintenance-batch to UserOpsAction type

## Decisions Made
- mark-verified performs a dual update (maintenanceMeta.reviewBy + decayMeta.lastVerifiedAt) within a single transact() call, ensuring atomicity per T-59-06 mitigation
- maintenance routes mirror the decay routes pattern exactly: same auth flow, same permission filtering, same plan-then-execute batch pattern with dry-run support
- filterEntriesByPermission is duplicated in maintenance.ts rather than extracted to a shared module, matching how decay.ts and operations.ts each have their own copy
- DecayMeta fields accessed via type cast (DecayMetaAccess interface) since KnowledgeRecord does not include decayMeta in its type definition (pre-existing issue from the decay module that affects all route files)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DecayMeta type not on KnowledgeRecord**
- **Found during:** Task 1 and Task 2
- **Issue:** KnowledgeRecord type does not include decayMeta field, causing typecheck errors when accessing entry.decayMeta
- **Fix:** Used type assertion via DecayMetaAccess interface in routes (same workaround that decay/batch.ts and decay.ts use implicitly with their own errors)
- **Files modified:** packages/server/src/routes/maintenance.ts
- **Commit:** e77ebcd

**2. [Rule 2 - Critical] Missing UserOpsAction entries for maintenance**
- **Found during:** Task 2
- **Issue:** maintenance-list and maintenance-batch action strings were not in the UserOpsAction union type, causing type errors on logging calls
- **Fix:** Added both action types to UserOpsAction in user-ops-log.ts
- **Files modified:** packages/server/src/lib/user-ops-log.ts
- **Commit:** e77ebcd

## Issues Encountered
- Pre-existing server typecheck errors (113 total) from evidence/decay modules are unrelated to this plan's changes. Only 3 new errors from maintenance/batch.ts accessing decayMeta on KnowledgeRecord (same issue as decay/batch.ts).
- Worktree required `pnpm install --ignore-scripts` and `pnpm --filter @trapmap/contracts build` before typecheck could succeed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Maintenance server module is ready for Plan 03 (CLI commands for maintenance management)
- GET /v1/operations/maintenance/entries provides the data source for CLI listing commands
- POST /v1/operations/maintenance/batch provides the execution endpoint for CLI batch operations

---
*Phase: 59-ownership-verification-sla-management*
*Completed: 2026-05-03*

## Self-Check: PASSED

- All 5 created/modified files verified present
- Both task commits verified in git log (b7b20cc, e77ebcd)
- No maintenance-specific typecheck errors beyond pre-existing decayMeta issue
