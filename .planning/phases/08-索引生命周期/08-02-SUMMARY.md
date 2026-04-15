---
phase: 08-索引生命周期
plan: "02"
subsystem: lifecycle-driven-indexing
tags: [lifecycle, indexing, events, approval, tdd]
wave: 2
dependency_graph:
  requires:
    - id: "08-01"
      reason: "pipeline.ts and normalize.ts from 08-01 provide sync and normalization functions"
  provides:
    - id: "08-03"
      reason: "events.ts provides lifecycle trigger mapping for adapter implementations"
    - id: "08-04"
      reason: "approval-triggered indexing enables update/deactivate index side effects"
  affects:
    - component: "review.ts"
      impact: "now triggers index sync after approval transaction commits"
    - component: "retrieval-workflow.test.ts"
      impact: "asserts indexState is created at approval time, not query time"
tech_stack:
  added:
    - "lifecycle event mapping: determineKnowledgeIndexAction()"
    - "event dispatcher: runKnowledgeIndexEvent()"
    - "mock adapters for testing: MockAdapter class"
  patterns:
    - "TDD: RED-GREEN cycle with events.test.ts and retrieval-workflow.test.ts"
    - "lifecycle-driven indexing: state transitions trigger index sync/remove/noop"
    - "transactional persistence: index state changes wrapped in store.transact()"
key_files:
  created:
    - path: "packages/server/src/lib/indexing/events.ts"
      provides: "lifecycle event dispatcher with transition-to-action mapping"
    - path: "packages/server/src/lib/indexing/events.test.ts"
      provides: "unit tests for event mapping and dispatch logic"
  modified:
    - path: "packages/server/src/routes/review.ts"
      provides: "approval-triggered index sync after transaction commit"
    - path: "packages/server/src/lib/retrieval-workflow.test.ts"
      provides: "integration tests for approval-triggered indexing"
decisions:
  - "decision: "Call index sync after review transaction commits, not during"
    rationale: "Preserves existing audit and permission boundaries while making indexing a derived side effect (T-08-05)"
    alternatives: ["Sync during transaction before commit", "Sync in background queue"]
  - "decision: "Use explicit previousState and nextState parameters for event mapping"
    rationale: "Prevents misclassifying rejected/deactivated content as searchable (T-08-06, T-08-07)"
    alternatives: ["Infer state from entry.lifecycleState alone"]
  - "decision: "Mock adapters in tests instead of real adapter implementations"
    rationale: "Adapters are implemented in 08-03, tests verify lifecycle logic without depending on concrete adapters"
    alternatives: ["Wait for 08-03 to implement tests", "Use in-memory adapters"]
metrics:
  duration: "7m 41s"
  started_at: "2026-04-14T13:24:50Z"
  completed_at: "2026-04-14T13:32:11Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  tests_added: 12
  tests_passing: 102
---

# Phase 08 Plan 02: Lifecycle Event Dispatch Summary

Translate lifecycle transitions into explicit indexing actions and wire the approval path so approved entries are indexed immediately after review.

## One-Liner

Lifecycle-driven indexing with explicit transition-to-action mapping and approval-triggered sync.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript unreachable code error in determineKnowledgeIndexAction**
- **Found during:** TypeScript compilation after GREEN phase
- **Issue:** Checking `nextState === 'approved'` before `previousState === 'approved' && nextState === 'approved'` created unreachable code
- **Fix:** Reordered checks to evaluate updated approved entries before new approved entries
- **Files modified:** `packages/server/src/lib/indexing/events.ts`
- **Commit:** `da03ff1`

**2. [Rule 3 - Blocking Issue] Added transactional persistence for index state changes**
- **Found during:** GREEN phase testing
- **Issue:** Mock adapters were being called but indexState wasn't persisting to store
- **Fix:** Wrapped syncKnowledgeIndex calls in store.transact() to persist changes
- **Files modified:** `packages/server/src/lib/indexing/events.ts`
- **Commit:** `770b145`

### Missing Files from 08-01

**3. [Rule 3 - Blocking Issue] Retrieved 08-01 pipeline and normalization files**
- **Found during:** Initial setup
- **Issue:** Worktree was missing pipeline.ts, normalize.ts, types.ts, and test files from 08-01
- **Fix:** Checked out files from commit 5104e43 (08-01 completion)
- **Files retrieved:**
  - `packages/server/src/lib/indexing/pipeline.ts`
  - `packages/server/src/lib/indexing/normalize.ts`
  - `packages/server/src/lib/indexing/types.ts`
  - `packages/server/src/lib/indexing/pipeline.test.ts`
  - `packages/server/src/lib/indexing/normalize.test.ts`
  - `packages/server/src/lib/retrieval/*` (recall channels, orchestrator, etc.)
  - `packages/server/src/lib/store.ts` (updated with indexState field)
  - `packages/server/src/lib/knowledge.ts` (updated with indexState initialization)

## Artifacts Created

### Lifecycle Event Dispatcher (`packages/server/src/lib/indexing/events.ts`)

```typescript
export function determineKnowledgeIndexAction(
  previousState: LifecycleState,
  nextState: LifecycleState,
): IndexAction {
  // Deactivation always triggers remove
  if (nextState === 'deactivated') {
    return 'remove';
  }

  // Updated approved entries should refresh their index
  if (previousState === 'approved' && nextState === 'approved') {
    return 'upsert';
  }

  // Only approved content should be indexed
  if (nextState === 'approved') {
    return 'upsert';
  }

  // All other transitions (rejected, submitted, agent-rejected, etc.) are noop
  return 'noop';
}

export async function runKnowledgeIndexEvent(args: {
  services: { store: JsonStore; data: StoreData };
  entryId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  adapters: IndexAdapter[];
}): Promise<void>
```

**Security properties:**
- Only `approved` state maps to `upsert` action (T-08-06)
- `deactivated` state maps to `remove` action
- All other states map to `noop`, preventing indexing of unapproved content
- Requires explicit `previousState` and `nextState` parameters to prevent inference errors (T-08-07)

### Review Route Integration (`packages/server/src/routes/review.ts`)

```typescript
// After transaction commits, trigger lifecycle-driven index sync
const data = await app.skillShareer.store.snapshot();
const entry = data.knowledgeEntries.find((e) => e.id === reviewedEntry.entry.id);
if (entry) {
  const adapters = (app as any).indexAdapters ?? [];
  await runKnowledgeIndexEvent({
    services: { store: app.skillShareer.store, data },
    entryId: reviewedEntry.entry.id,
    previousState: reviewedEntry.previousState as any,
    nextState: reviewedEntry.nextState as any,
    reason: `reviewer-${payload.decision}`,
    adapters,
  });
}
```

**Preserves existing boundaries:**
- Index sync runs AFTER permission checks, audit logging, and transaction commit (T-08-05)
- Uses real `previousState` captured before `applyReviewDecision`
- Adapters injected from app (empty array until 08-03)

### Test Coverage

**Unit tests (`events.test.ts`):**
- Lifecycle event mapping returns correct actions for all transitions
- Upsert triggered for reviewer-approved, updated approved entries
- Remove triggered for deactivated transitions
- Noop triggered for rejected, submitted, agent-rejected states
- Event dispatcher calls sync/remove based on action type
- Mock adapters verify sync/remove calls are made correctly

**Integration tests (`retrieval-workflow.test.ts`):**
- Approved entries gain persisted `indexState` after review (IDX-04)
- Rejected entries do NOT gain `indexState` (T-08-06)
- IndexState exists before any search query (proves approval-triggered, not query-time)
- Approval-triggered sync respects approved-only boundary (T-08-05)

## Key Links Verified

✅ `review.ts` → `events.ts` via `runKnowledgeIndexEvent` call after transaction commit
✅ `events.ts` → `pipeline.ts` via `syncKnowledgeIndex` for upsert actions
✅ `events.ts` → adapters via `adapter.remove()` for remove actions
✅ `retrieval-workflow.test.ts` → `review.ts` via approval workflow assertions

## Threat Mitigations

| Threat ID | Mitigation |
|-----------|------------|
| T-08-05 | Index sync called only after existing permission and audit checks complete |
| T-08-06 | Only `approved` state maps to `upsert`; all other states map to `noop` or `remove` |
| T-08-07 | Event mapping requires explicit `previousState` and `nextState` parameters |
| T-08-08 | Workflow tests assert persisted `indexState` after review, not inferred behavior |

## Verification Results

```bash
pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts src/lib/retrieval-workflow.test.ts
# Test Files: 8 passed (8)
# Tests: 102 passed (102)
```

All acceptance criteria met:
- ✅ `test -f packages/server/src/lib/indexing/events.test.ts`
- ✅ `rg -n "reviewer-approved|updated|deactivated|noop|remove|upsert" packages/server/src/lib/indexing/events.test.ts`
- ✅ `rg -n "indexState|embeddingCache|knowledge/review" packages/server/src/lib/retrieval-workflow.test.ts`
- ✅ `rg -n "export function determineKnowledgeIndexAction|export async function runKnowledgeIndexEvent" packages/server/src/lib/indexing/events.ts`
- ✅ `rg -n "runKnowledgeIndexEvent" packages/server/src/routes/review.ts`
- ✅ `rg -n "reviewer-approved|decision === 'approve'|decision: payload.decision" packages/server/src/routes/review.ts`

## Known Stubs

None - all lifecycle event behavior is implemented and tested.

## Next Steps

Plan 08-03 will implement the vector and keyword adapters that are currently mocked in tests. The lifecycle event dispatcher is ready to call real adapters once they are registered in the app.

## Self-Check: PASSED

**Created Files:**
- ✅ `packages/server/src/lib/indexing/events.ts`
- ✅ `packages/server/src/lib/indexing/events.test.ts`

**Commits:**
- ✅ `9b01217`: test(08-02): add failing tests for lifecycle event mapping and approval-triggered indexing
- ✅ `770b145`: feat(08-02): implement lifecycle event dispatch and approval-triggered index sync
- ✅ `da03ff1`: fix(08-02): reorder lifecycle state checks to fix TypeScript error

**Tests:**
- ✅ 102 tests passing
- ✅ All events.test.ts tests passing
- ✅ All retrieval-workflow.test.ts tests passing
