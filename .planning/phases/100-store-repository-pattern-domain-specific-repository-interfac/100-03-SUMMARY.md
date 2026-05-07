---
phase: 100-store-repository-pattern
plan: 03
subsystem: api
tags: [fastify, repository-pattern, dependency-injection, async-factory]

# Dependency graph
requires:
  - phase: 100-01
    provides: "Feedback, audit, and duplicates repository modules"
  - phase: 100-02
    provides: "Lineage, graph-index repos and createAllRepos async factory"
provides:
  - "Unified repos object wired into Fastify decoration via onReady hook"
  - "repos populated in both JSON mode (InMemory) and PG mode (with pool)"
affects: [100-04, 100-05, route-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-onReady-hook-for-repos-wiring]

key-files:
  created: []
  modified:
    - packages/server/src/app.ts

key-decisions:
  - "Use onReady hook to populate repos (async createAllRepos cannot run in sync decoration)"
  - "Separate onReady hook for repos wiring keeps existing PG hook unchanged"
  - "JSON mode repos created with store-only config (InMemory implementations)"

patterns-established:
  - "onReady hook pattern for async repository initialization in both JSON and PG modes"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-05-07
---

# Phase 100 Plan 03: Wire Repos into app.ts Summary

**Async repos factory wired into Fastify onReady hook, populating app.skillShareer.repos in both JSON (InMemory) and PG (with pool) modes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-07T09:12:37Z
- **Completed:** 2026-05-07T09:21:29Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `createAllRepos` import from `./lib/repos/index.js` to app.ts
- Added dedicated onReady hook that populates `app.skillShareer.repos` in both JSON and PG modes
- JSON mode: repos created with store only (InMemory implementations wrapping SkillShareerStore)
- PG mode: repos recreated with pool after existing individual flat props are set
- All existing flat repo props (knowledgeRepo, artifactRepo, etc.) preserved for backward compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire async repos into app.ts decoration and onReady hook** - `9719611` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `packages/server/src/app.ts` - Added createAllRepos import and onReady hook for repos wiring

## Decisions Made
- Used a separate onReady hook for repos wiring rather than modifying the existing PG hook, keeping changes additive and minimizing risk to existing behavior
- In PG mode, `createAllRepos` is called with `{ store, pool }` to create pool-aware implementations; in JSON mode, called with `{ store }` only for InMemory implementations
- The onReady hook runs after the existing PG hook (which sets individual flat props), so the repos object benefits from the same pool configuration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `app.skillShareer.repos` is now available to all routes in both JSON and PG modes
- Ready for Plan 04: migrate `resolveAuthContext` to use repos instead of individual flat props
- Ready for Plan 05: migrate route files to use repos

## Self-Check: PASSED

- [x] packages/server/src/app.ts exists
- [x] 100-03-SUMMARY.md exists
- [x] Commit 9719611 (task 1) exists
- [x] Commit e80da88 (docs) exists
- [x] createAllRepos import present in app.ts
- [x] repos wiring in onReady hook present
- [x] Flat repo props preserved for backward compat

---
*Phase: 100-store-repository-pattern*
*Completed: 2026-05-07*
