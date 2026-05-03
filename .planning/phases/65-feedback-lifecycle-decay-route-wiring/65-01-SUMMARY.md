---
phase: 65-feedback-lifecycle-decay-route-wiring
plan: 01
subsystem: contracts
tags: [zod, feedback, lifecycle, decay, type-fixes]

# Dependency graph
requires:
  - phase: 57-admin-feedback-management
    provides: feedback domain schemas, feedback admin routes, feedback batch planning
  - phase: 64-retrieval-pipeline-integration
    provides: decayStateSchema, freshness decay scoring, lifecycle types
provides:
  - LifecycleTriggerRule zod schema and type in @trapmap/contracts
  - DEFAULT_LIFECYCLE_TRIGGER_RULES constant (outdated->stale, incorrect->review-due)
  - Fixed imports in lifecycle-triggers.ts and batch.ts
  - Removed dead executeFeedbackBatch function from batch.ts
affects: [65-02, feedback-admin routes, lifecycle trigger wiring]

# Tech tracking
tech-stack:
  added: []
  patterns: [lifecycle-trigger-rule pattern with zod schema + type + default constant]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/feedback.ts
    - packages/server/src/lib/feedback/lifecycle-triggers.ts
    - packages/server/src/lib/feedback/batch.ts

key-decisions:
  - "Removed unused imports (AppError, KnowledgeRecord, SkillShareerStore, FeedbackQueueRecord, nowIso) from batch.ts since executeFeedbackBatch was dead code"
  - "Removed executeFeedbackBatch entirely because feedback-admin.ts does inline batch execution"

patterns-established:
  - "LifecycleTriggerRule pattern: zod schema + z.infer type + DEFAULT_* constant array, following decay.ts conventions"

requirements-completed: [FEEDBACK-03]

# Metrics
duration: 4min
completed: 2026-05-03
---

# Phase 65 Plan 01: Lifecycle Trigger Contracts & Import Fixes Summary

**LifecycleTriggerRule zod schema with DEFAULT_LIFECYCLE_TRIGGER_RULES constant, broken FeedbackQueueItemRecord renamed to FeedbackQueueRecord, dead executeFeedbackBatch removed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-03T15:20:36Z
- **Completed:** 2026-05-03T15:24:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `lifecycleTriggerRuleSchema`, `LifecycleTriggerRule` type, and `DEFAULT_LIFECYCLE_TRIGGER_RULES` constant to `@trapmap/contracts` domain/feedback.ts
- Fixed `FeedbackQueueItemRecord` -> `FeedbackQueueRecord` in lifecycle-triggers.ts (3 occurrences: import, checkLifecycleTriggers param, applyLifecycleTrigger param)
- Fixed batch.ts imports: removed unused LifecycleTriggerRule, DEFAULT_LIFECYCLE_TRIGGER_RULES, checkLifecycleTriggers, AppError, KnowledgeRecord, SkillShareerStore, FeedbackQueueRecord, nowIso
- Removed dead `executeFeedbackBatch` function (64 lines) from batch.ts -- route does inline execution
- All 22 existing feedback tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add LifecycleTriggerRule schema and DEFAULT_LIFECYCLE_TRIGGER_RULES to contracts** - `ec51149` (feat)
2. **Task 2: Fix broken imports in lifecycle-triggers.ts and batch.ts** - `487e07f` (fix)

## Files Created/Modified
- `packages/contracts/src/domain/feedback.ts` - Added lifecycleTriggerRuleSchema, LifecycleTriggerRule type, DEFAULT_LIFECYCLE_TRIGGER_RULES constant
- `packages/server/src/lib/feedback/lifecycle-triggers.ts` - Fixed FeedbackQueueItemRecord -> FeedbackQueueRecord in import and function signatures
- `packages/server/src/lib/feedback/batch.ts` - Removed unused imports, removed dead executeFeedbackBatch function

## Decisions Made
- Removed all imports that became unused after executeFeedbackBatch deletion (AppError, KnowledgeRecord, SkillShareerStore, FeedbackQueueRecord, nowIso) to keep the file clean and avoid confusing downstream consumers
- executeFeedbackBatch was never called from any route -- feedback-admin.ts does its own inline batch execution within a transact block, so removing it eliminates dead code that referenced the wrong type name

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed additional unused imports from batch.ts**
- **Found during:** Task 2 (fix broken imports)
- **Issue:** After removing executeFeedbackBatch, several imports became unused (AppError, KnowledgeRecord, SkillShareerStore, FeedbackQueueRecord, nowIso) which would cause lint/compile warnings
- **Fix:** Removed all newly-unused imports in the same task commit
- **Files modified:** packages/server/src/lib/feedback/batch.ts
- **Verification:** grep confirms zero references to each removed import
- **Committed in:** 487e07f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical cleanup)
**Impact on plan:** Cleanup necessary for correctness. No scope creep.

## Issues Encountered
None - plan executed cleanly. Pre-existing evidence/model.test.ts failures and operations.ts TS errors are unrelated to this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 65-02 can now import LifecycleTriggerRule and DEFAULT_LIFECYCLE_TRIGGER_RULES from @trapmap/contracts
- lifecycle-triggers.ts compiles with correct FeedbackQueueRecord type
- batch.ts is clean with only planFeedbackBatch (no dead code)
- Ready to wire checkLifecycleTriggers into feedback-admin.ts post-batch execution

---
*Phase: 65-feedback-lifecycle-decay-route-wiring*
*Completed: 2026-05-03*

## Self-Check: PASSED

All 3 modified files exist. Both task commits (ec51149, 487e07f) found in git log. SUMMARY.md created.
