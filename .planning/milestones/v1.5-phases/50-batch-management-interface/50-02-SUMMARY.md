---
phase: 50-batch-management-interface
plan: 02
subsystem: api
tags: [routes, decay, batch, http, auth]

requires:
  - phase: 48-lifecycle-state-machine
    provides: computeDecayState, supersedeEntry
  - phase: 50-batch-management-interface/01
    provides: planBatchOperation, executeBatchOperation, batch schemas
provides:
  - GET /v1/operations/decay/entries for listing with decay enrichment
  - POST /v1/operations/decay/batch for batch mutations with dry-run
  - POST /v1/operations/decay/search for pattern search with decay facets
affects: [50-03]

tech-stack:
  added: []
  patterns: [fastify-plugin, permission-checking, query-param-coercion]

key-files:
  created:
    - packages/server/src/routes/decay.ts
    - packages/server/src/routes/decay.test.ts
  modified:
    - packages/server/src/app.ts
    - packages/server/src/lib/user-ops-log.ts
    - packages/contracts/src/domain/decay.ts

key-decisions:
  - "Query params use z.preprocess to handle string-to-array coercion for decayStates and labels"
  - "All mutation routes require knowledge:update permission; list/search routes require knowledge:export"
  - "Dry-run returns plan without persisting; execute returns results with appliedAt timestamp"
  - "Route tests use system-admin auth helper for full permission access"

patterns-established:
  - "Query param preprocessing: z.preprocess for string-to-array coercion"
  - "Route permission pattern: resolveAuthContext + requirePermission for auth gating"

requirements-completed: [DECAY-03]

duration: 20min
completed: 2026-05-02
---

# Plan 50-02: Decay Management Routes Summary

**Server routes for decay management with batch operations and decay-state filtering**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-02T19:50:00Z
- **Completed:** 2026-05-02T20:05:00Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Created decay.ts route plugin with three endpoints (GET entries, POST batch, POST search)
- Added user operation action types (decay-list, decay-batch, decay-search)
- Registered decayRoutes in app.ts
- Added query param preprocessing for array coercion
- 12 integration tests covering all endpoints with auth and filtering

## Task Commits

Each task was committed atomically:

1. **Task 1: Create decay management routes with integration tests** - `HEAD` (feat)

## Files Created/Modified
- `packages/server/src/routes/decay.ts` - Fastify plugin with three decay management endpoints
- `packages/server/src/routes/decay.test.ts` - 12 integration tests covering all endpoints
- `packages/server/src/app.ts` - Added decayRoutes import and registration
- `packages/server/src/lib/user-ops-log.ts` - Added decay-list, decay-batch, decay-search action types
- `packages/contracts/src/domain/decay.ts` - Added z.preprocess for string-to-array query param coercion

## Decisions Made
- Query params use z.preprocess to convert comma-separated strings to arrays for decayStates and labels
- All mutation routes require knowledge:update permission; list/search routes require knowledge:export
- Dry-run mode returns plan without persisting; execute mode returns results with appliedAt timestamp
- Route tests use system-admin auth helper for full permission access

## Deviations from Plan

Minor: Added z.preprocess for query param coercion to handle Fastify's string-based query params.

## Issues Encountered

Query params from Fastify come as strings, but Zod expected arrays. Fixed by adding z.preprocess to convert comma-separated strings to arrays.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Routes ready for CLI integration (50-03)
- Test patterns established for CLI tests
- API surface stable for batch management interface

---
*Phase: 50-batch-management-interface*
*Completed: 2026-05-02*
