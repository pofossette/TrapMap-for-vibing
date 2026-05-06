---
phase: 101-lifecycle-state-machine-with-event-bus-explicit-state-machin
plan: 04
subsystem: server
tags: [fastify, event-bus, lifecycle, domain-events, route-migration]

# Dependency graph
requires:
  - phase: 101-01
    provides: LifecycleEventBus with emitDomainEvent/emitDomainEventAsync, findTransitionEvent lookup
  - phase: 101-02
    provides: createIndexingSubscriber, createAuditSubscriber, createConflictSubscriber factories
  - phase: 101-03
    provides: eventBus wired into app.ts with 11 subscribers registered in onReady hook
provides:
  - "All 5 route files emit domain events via findTransitionEvent + eventBus.emitDomainEventAsync"
  - "Direct runKnowledgeIndexEvent and detectConflicts calls removed from routes"
  - "emitDomainEventAsync added to LifecycleEventBus for awaiting async subscribers"
  - "Indexing subscriber updated to allow self-transitions for content refresh"
affects: [101-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Route event emission via findTransitionEvent + emitDomainEventAsync"]

key-files:
  created: []
  modified:
    - "packages/server/src/routes/review.ts"
    - "packages/server/src/routes/knowledge.ts"
    - "packages/server/src/routes/candidates.ts"
    - "packages/server/src/routes/operations/knowledge-legacy.ts"
    - "packages/server/src/routes/decay.ts"
    - "packages/server/src/lib/lifecycle/event-bus.ts"
    - "packages/server/src/lib/lifecycle/subscribers/indexing.ts"

key-decisions:
  - "Added emitDomainEventAsync to LifecycleEventBus for route handlers that must await subscriber completion"
  - "Indexing subscriber allows self-transitions when reason is 'updated' (approved entry content refresh)"
  - "knowledge.ts update endpoint uses fallback 'knowledge.approved' event name for self-transitions"
  - "decay.ts batch deactivate emits events with previousState 'approved' for each mutated record"
  - "Dual-write repository patterns preserved in review.ts and knowledge.ts"

patterns-established:
  - "Route event emission pattern: findTransitionEvent(from, to) + eventBus.emitDomainEventAsync(payload)"
  - "Async event bus pattern: emitDomainEventAsync awaits all handlers, emitDomainEvent is fire-and-forget"

requirements-completed:
  - 101-08

# Metrics
duration: 33min
completed: 2026-05-06
---

# Phase 101 Plan 04: Route Integration Summary

**All 5 route files migrated from direct runKnowledgeIndexEvent/detectConflicts calls to findTransitionEvent + eventBus.emitDomainEventAsync, with dual-write repository patterns preserved**

## Performance

- **Duration:** 33 min
- **Started:** 2026-05-06T22:27:04Z
- **Completed:** 2026-05-06T22:59:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Migrated review.ts: replaced direct runKnowledgeIndexEvent + detectConflicts with event emission, preserved dual-write knowledgeRepo.updateLifecycle and audit-in-transact
- Migrated knowledge.ts: replaced direct runKnowledgeIndexEvent with event emission for approved entry updates, preserved dual-write knowledgeRepo.updateGovernance
- Migrated candidates.ts: replaced direct runKnowledgeIndexEvent with event emission for duplicate resolution publishing
- Migrated knowledge-legacy.ts: replaced direct runKnowledgeIndexEvent with event emission for deactivation
- Migrated decay.ts: added event emission for batch deactivate operations
- Added emitDomainEventAsync to LifecycleEventBus for awaiting async subscriber completion
- Fixed indexing subscriber to allow self-transitions when reason is 'updated'

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate review.ts** - `01c8971` (refactor)
2. **Task 2: Migrate knowledge.ts, candidates.ts, knowledge-legacy.ts, decay.ts** - `d12c0d0` (refactor)

**Plan metadata:** (docs: complete plan)

## Files Created/Modified
- `packages/server/src/routes/review.ts` - Replaced direct indexing + conflict calls with eventBus.emitDomainEventAsync
- `packages/server/src/routes/knowledge.ts` - Replaced direct indexing call with event emission on update
- `packages/server/src/routes/candidates.ts` - Replaced direct indexing call with event emission on resolution
- `packages/server/src/routes/operations/knowledge-legacy.ts` - Replaced direct indexing call with event emission on deactivate
- `packages/server/src/routes/decay.ts` - Added event emission for batch deactivate operations
- `packages/server/src/lib/lifecycle/event-bus.ts` - Added emitDomainEventAsync method for awaiting async handlers
- `packages/server/src/lib/lifecycle/subscribers/indexing.ts` - Allow self-transitions when reason is 'updated'

## Decisions Made
- Added emitDomainEventAsync to LifecycleEventBus: routes need to await subscriber completion (especially indexing) before returning responses. The fire-and-forget emitDomainEvent would cause tests to fail because indexState wouldn't be updated before the response.
- Indexing subscriber self-transition guard relaxed: the original guard skipped all self-transitions, but approved entry content updates (labels, shortcut, detail) need index refresh. The guard now allows self-transitions when reason is 'updated'.
- knowledge.ts uses fallback event name: findTransitionEvent('approved', 'approved') returns undefined (no self-transition in table), so the route falls back to 'knowledge.approved' directly.
- decay.ts batch events: only 'deactivate' action changes lifecycle state. extend/mark-review only change decayMeta. The route emits events for all mutated records where lifecycleState changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Indexing subscriber blocks self-transitions for content refresh**
- **Found during:** Task 2 (knowledge.ts migration)
- **Issue:** The indexing subscriber created in Plan 02 skips all self-transitions (previousState === nextState). But the knowledge.ts update endpoint needs to refresh indexes when an approved entry's content changes (labels, shortcut, detail) without changing lifecycle state.
- **Fix:** Modified createIndexingSubscriber to allow self-transitions when event.reason is 'updated'
- **Files modified:** packages/server/src/lib/lifecycle/subscribers/indexing.ts
- **Verification:** knowledge.test.ts passes (10/10 tests)
- **Committed in:** d12c0d0 (Task 2 commit)

**2. [Rule 1 - Bug] emitDomainEvent is fire-and-forget, routes need await**
- **Found during:** Task 1 (review.ts migration)
- **Issue:** The original emitDomainEvent method doesn't await async handlers. Routes need indexing to complete before returning (tests verify indexState after response).
- **Fix:** Added emitDomainEventAsync method to LifecycleEventBus that collects and awaits all handler promises
- **Files modified:** packages/server/src/lib/lifecycle/event-bus.ts
- **Verification:** review.test.ts passes (10/10 tests)
- **Committed in:** 01c8971 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. The emitDomainEventAsync addition is a natural extension of the event bus API. The indexing subscriber fix relaxes an overly strict guard. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All route files now emit domain events via the event bus
- Direct runKnowledgeIndexEvent calls remain only in traps.ts (out of scope for this plan)
- Ready for Plan 05 (if any) or phase completion

---
*Phase: 101-lifecycle-state-machine-with-event-bus-explicit-state-machin*
*Completed: 2026-05-06*
