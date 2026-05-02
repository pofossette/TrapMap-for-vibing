---
phase: 57-admin-feedback-management
reviewed: 2026-05-03T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - packages/cli/src/commands/admin-feedback.test.ts
  - packages/cli/src/commands/admin-feedback.ts
  - packages/cli/src/index.ts
  - packages/contracts/src/domain/boundary.ts
  - packages/contracts/src/domain/feedback.ts
  - packages/server/src/app.ts
  - packages/server/src/lib/feedback/batch.ts
  - packages/server/src/lib/feedback/lifecycle-triggers.ts
  - packages/server/src/lib/feedback/quality-score.ts
  - packages/server/src/lib/user-ops-log.ts
  - packages/server/src/routes/admin-feedback.test.ts
  - packages/server/src/routes/admin-feedback.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-05-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed 12 files spanning the admin feedback management feature (Phase 57). The implementation is well-structured with clear separation between contracts, server logic, and CLI commands. Schema validation is consistently applied. The batch processing correctly separates planning from execution with dry-run support.

Found 3 warnings and 4 info items. No critical security or correctness issues detected. The warnings center on a TOCTOU race in the batch execution path, a missing validation check on the transition action (allowing it without a required target state through the API), and misleading display output in the CLI formatter.

## Warnings

### WR-01: TOCTOU race between plan and execute in batch endpoint

**File:** `packages/server/src/routes/admin-feedback.ts:206-226`
**Issue:** The execute path in `POST /v1/admin/feedback/batch` takes a snapshot for planning (`preSnapshot` on line 206), then later executes inside a transaction (`transact` on line 224). The response returns the plan computed from the pre-transaction snapshot (`items` from line 209), but the actual mutations inside `executeFeedbackBatch` re-derive eligibility by calling `planFeedbackBatch` again against the transaction's fresh `data`. If another request modifies feedback between the pre-snapshot and the transaction, the response may show items as eligible that were actually skipped, or vice versa. The `eligibleCount` and `totalIneligible` in the response reflect the stale plan, not what actually happened.

**Fix:** Move the plan computation inside the transaction for execute mode, or use the same plan for both the response and the execution. For example, pass the pre-computed plan into `executeFeedbackBatch` instead of re-planning inside it:
```typescript
// Option A: compute plan inside transaction
const mutatedRecords = await app.skillShareer.store.transact((data) => {
  const planItems = planFeedbackBatch(data, input, now);
  const eligiblePlanItems = planItems.filter((item) => item.eligible);
  // execute only eligible items...
  return { planItems, mutatedCount };
});
```

### WR-02: Missing `targetDecayState` validation for transition action at API level

**File:** `packages/server/src/routes/admin-feedback.ts:144-148`
**Issue:** The `feedbackBatchRequestSchema` declares `targetDecayState` as optional, and the route handler does not validate that `targetDecayState` is present when `action` is `transition`. The validation only happens inside `planFeedbackBatch` (batch.ts line 159), which silently marks items as ineligible rather than returning a 400 error. A caller can send `{"action":"transition","feedbackIds":["..."]}` without `targetDecayState` and receive a 200 response with all items marked ineligible -- instead of an upfront validation error.

**Fix:** Add an explicit validation check in the route handler after parsing the body, or add a `refine` to the Zod schema:
```typescript
// In route handler after line 148:
if (body.action === 'transition' && !body.targetDecayState) {
  throw new AppError('VALIDATION_ERROR', 400, 'targetDecayState is required for transition action');
}
```

### WR-03: Description always displays trailing ellipsis regardless of length

**File:** `packages/cli/src/commands/admin-feedback.ts:35-37`
**Issue:** `formatFeedbackList` always appends `...` after the description slice (`"${desc}..."`), even when the description is shorter than 60 characters. This is misleading for short feedback where the full text is shown but the ellipsis implies truncation.

**Fix:** Only append the ellipsis when the description was actually truncated:
```typescript
const descRaw = item.description;
const desc = descRaw.length > 60 ? descRaw.slice(0, 60) + '...' : descRaw;
```

## Info

### IN-01: Duplicate error handler branches in app.ts

**File:** `packages/server/src/app.ts:229-241`
**Issue:** The error handler has two consecutive branches that handle `AppError` identically: first via `isAppError(error)` (a type guard function), then via `error instanceof AppError`. The second branch is unreachable because `isAppError` already catches all `AppError` instances. This is dead code, not a bug, but it adds confusion.

**Fix:** Remove the redundant `instanceof AppError` branch (lines 236-241):
```typescript
app.setErrorHandler((error, _request, reply) => {
  if (isAppError(error)) {
    return reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
    });
  }
  // ... rest stays the same
});
```

### IN-02: FeedbackQueueItemRecord imported but KnowledgeRecord unused in batch.ts

**File:** `packages/server/src/lib/feedback/batch.ts:19`
**Issue:** The `KnowledgeRecord` type is imported but never used in the file. The `data.knowledgeEntries` access at lines 70 and 233 does not require an explicit type annotation.

**Fix:** Remove the unused `KnowledgeRecord` import:
```typescript
import type {
  FeedbackQueueItemRecord,
  // KnowledgeRecord,  <-- remove
  SkillShareerStore,
  StoreData,
} from '../store.js';
```

### IN-03: DEFAULT_LIFECYCLE_TRIGGER_RULES lacks explicit type annotation

**File:** `packages/contracts/src/domain/feedback.ts:141`
**Issue:** `DEFAULT_LIFECYCLE_TRIGGER_RULES` is typed as `z.infer<typeof lifecycleTriggerRuleSchema>[]` but this is inferred rather than enforced at the declaration. If someone adds an invalid rule, it would only be caught by consumers. A runtime `lifecycleTriggerRuleSchema.array().parse()` call or explicit `as const` would strengthen safety.

**Fix:** This is a minor typing concern. Consider asserting the type explicitly:
```typescript
export const DEFAULT_LIFECYCLE_TRIGGER_RULES: LifecycleTriggerRule[] = [
  // ...
];
```

### IN-04: entryShortcut also always truncated with no ellipsis indicator

**File:** `packages/cli/src/commands/admin-feedback.ts:34`
**Issue:** `entryShortcut` is silently truncated with `slice(0, 40)` with no ellipsis. When shortcuts exceed 40 characters, the user sees a truncated string with no indication it was cut. This is a display concern, not a bug.

**Fix:** Apply the same ellipsis pattern as the description:
```typescript
const entryRaw = item.entryShortcut;
const entry = entryRaw.length > 40 ? entryRaw.slice(0, 40) + '...' : entryRaw;
```

---

_Reviewed: 2026-05-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
