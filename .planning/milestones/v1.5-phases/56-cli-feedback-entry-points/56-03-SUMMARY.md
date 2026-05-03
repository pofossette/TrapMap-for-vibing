---
phase: 56
plan: 03
subsystem: server
tags: [feedback, routes, store, contracts]
dependency_graph:
  requires: [56-01-PLAN]
  provides: [POST /v1/feedback endpoint, FeedbackQueueItemRecord]
  affects: [packages/server/src/lib/store.ts, packages/server/src/app.ts]
tech_stack:
  added: [zod feedback schemas, Fastify feedback routes]
  patterns: [auth-gated route, store transact, null-to-optional response mapping]
key_files:
  created:
    - packages/contracts/src/domain/feedback.ts
    - packages/server/src/routes/feedback.ts
    - packages/server/src/routes/feedback.test.ts
  modified:
    - packages/contracts/src/index.ts
    - packages/server/src/lib/store.ts
    - packages/server/src/app.ts
    - packages/server/src/lib/user-ops-log.ts
decisions:
  - Created feedback contracts inline (Rule 3 - 56-01 dependency not yet committed)
  - Response mapping strips null store fields to satisfy Zod optional (expects undefined)
  - Added feedback to UserOpsAction union for operation logging
metrics:
  duration: 580s
  completed: "2026-05-02"
---

# Phase 56 Plan 03: Server Feedback Route and Store Summary

Feedback submission endpoint (POST /v1/feedback) with store persistence, auth gating, Zod validation, and operation logging.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 56-03-01 | Add FeedbackQueueItemRecord to store | 1a8a29c | store.ts, feedback.ts (contracts), index.ts (contracts) |
| 56-03-02 | Create feedback routes | 4be84e2 | feedback.ts (routes), app.ts, user-ops-log.ts |
| 56-03-03 | Create feedback route tests | ef0baf1 | feedback.test.ts, feedback.ts (routes) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created feedback contracts inline (Plan 56-01 dependency)**
- **Found during:** Task 56-03-01
- **Issue:** packages/contracts/src/domain/feedback.ts did not exist; Plan 56-01 had not been committed to this branch
- **Fix:** Created feedback.ts contracts file and added export to index.ts following the 56-01 plan specification
- **Files modified:** packages/contracts/src/domain/feedback.ts, packages/contracts/src/index.ts
- **Commit:** 1a8a29c

**2. [Rule 1 - Bug] Null-to-optional field mapping in response**
- **Found during:** Task 56-03-03 (test failures)
- **Issue:** Store records use `null` for optional fields (context, querySeed, customAnswers, adminNotes) but Zod `.optional()` expects `undefined`, causing 400 validation errors on response serialization
- **Fix:** Built response object explicitly, omitting null optional fields instead of spreading the store record
- **Files modified:** packages/server/src/routes/feedback.ts
- **Commit:** ef0baf1

**3. [Rule 2 - Critical] Added 'feedback' to UserOpsAction type**
- **Found during:** Task 56-03-02
- **Issue:** logUserOperation call with action 'feedback' would fail at runtime since UserOpsAction union didn't include it
- **Fix:** Added 'feedback' to the UserOpsAction type union
- **Files modified:** packages/server/src/lib/user-ops-log.ts
- **Commit:** 4be84e2

## Verification Results

- `pnpm --filter @trapmap/server typecheck`: PASSED (clean, no errors)
- `pnpm --filter @trapmap/server test`: PASSED (678 tests, 44 files, all green)
- `pnpm --filter @trapmap/server test -- routes/feedback.test.ts`: PASSED (6 tests)

## Test Coverage

| Test | Description | Status |
|------|-------------|--------|
| creates feedback entry with valid submission | POST valid payload, expect 201 with feedback record | PASSED |
| returns 401 when not authenticated | POST without session token | PASSED |
| returns 400 when description is too short | POST with 9-char description | PASSED |
| accepts submission with optional context field | POST with context, verify persisted | PASSED |
| accepts submission with customAnswers from skill prompts | POST with customAnswers array | PASSED |
| persists feedback to feedbackQueue in store | Verify store.feedbackQueue after POST | PASSED |

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.
