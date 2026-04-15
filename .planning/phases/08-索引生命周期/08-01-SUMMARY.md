---
phase: 08-索引生命周期
plan: "01"
type: execute
wave: 1
completed_date: "2026-04-14T13:23:24Z"
duration_seconds: 2560
tags: [indexing, pipeline, normalization, tdd]
subsystem: indexing
---

# Phase 8 Plan 1: Index State Model, Normalization, and Pipeline Summary

Establish the server-internal index persistence model, deterministic normalization boundary, and orchestration pipeline that later lifecycle hooks and adapters will use.

## One-Liner
Created persisted `KnowledgeRecord.indexState`, deterministic normalization via `normalizeKnowledgeIndexDocument`, and sync/reconcile pipeline that fans out to adapters only for approved entries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors in test files**
- **Found during:** Task 2
- **Issue:** Mock adapters returning undefined instead of proper IndexSyncResult, readonly arrays not assignable to mutable types
- **Fix:** Updated all mock adapter calls to return proper IndexSyncResult objects, removed `as const` assertions causing readonly array issues
- **Files modified:** `packages/server/src/lib/indexing/pipeline.test.ts`, `packages/server/src/lib/indexing/normalize.test.ts`
- **Commit:** 5104e43

**2. [Rule 1 - Bug] Fixed TypeScript errors in operations route**
- **Found during:** Task 2 (type checking)
- **Issue:** Optional property handling with exactOptionalPropertyTypes, possibly undefined array access
- **Fix:** Used conditional spread for optional properties, added null checks for array access
- **Files modified:** `packages/server/src/routes/operations.ts`, `packages/server/src/routes/operations.test.ts`
- **Commit:** 5104e43

**3. [Rule 1 - Bug] Fixed pre-review function call signature in tests**
- **Found during:** Task 2 (test execution)
- **Issue:** Tests calling runPreReview with wrong argument format - passing submission fields directly instead of wrapped object
- **Fix:** Updated all runPreReview calls to pass `{ existingEntries, submission }` structure
- **Files modified:** `packages/server/src/lib/indexing/pipeline.test.ts`
- **Commit:** 5104e43

**4. [Rule 1 - Bug] Fixed deterministic test comparing normalizedAt timestamps**
- **Found during:** Task 2 (test execution)
- **Issue:** Test expected full object equality but normalizedAt timestamp changes between calls
- **Fix:** Updated test to only compare deterministic fields (canonicalText, tokens, contentHash) and validate timestamp format separately
- **Files modified:** `packages/server/src/lib/indexing/normalize.test.ts`
- **Commit:** 5104e43

**5. [Rule 2 - Missing critical functionality] Added indexState initialization to knowledge entry creation**
- **Found during:** Task 2 (implementation)
- **Issue:** KnowledgeRecord gained new indexState field but createKnowledgeEntryRecord didn't initialize it
- **Fix:** Added `indexState: null` to record initialization in knowledge.ts
- **Files modified:** `packages/server/src/lib/knowledge.ts`
- **Commit:** 5104e43

**6. [Rule 2 - Missing critical functionality] Added indexState to operations test mock entry**
- **Found during:** Task 2 (type checking)
- **Issue:** operations.test.ts created mock KnowledgeRecord without new indexState field
- **Fix:** Added `indexState: null` to createMockEntry function
- **Files modified:** `packages/server/src/routes/operations.test.ts`
- **Commit:** 5104e43

## Auth Gates
None encountered during this plan.

## Artifacts Created

### Core Implementation
- `packages/server/src/lib/indexing/types.ts` - NormalizedIndexDocument, IndexAdapter, sync result types
- `packages/server/src/lib/indexing/normalize.ts` - Deterministic canonical text, token, and content hash generation
- `packages/server/src/lib/indexing/pipeline.ts` - syncKnowledgeIndex and reconcileKnowledgeIndexes orchestration
- `packages/server/src/lib/store.ts` - Added KnowledgeIndexStateRecord, AdapterSyncState, and indexState field to KnowledgeRecord
- `packages/server/src/lib/knowledge.ts` - Initialize indexState to null in createKnowledgeEntryRecord

### Tests
- `packages/server/src/lib/indexing/normalize.test.ts` - 11 tests covering determinism, token normalization, content hashing
- `packages/server/src/lib/indexing/pipeline.test.ts` - 6 tests covering adapter fan-out, lifecycle gating, idempotency, reconciliation

### Bug Fixes
- `packages/server/src/routes/operations.ts` - Fixed optional property handling and undefined checks
- `packages/server/src/routes/operations.test.ts` - Added indexState to mock entries

## Decisions Made

1. **Persist index state on KnowledgeRecord instead of separate index table** - Keeps indexing state co-located with the source record, simplifies reconciliation, avoids additional persistence layer mid-milestone.

2. **Normalize once before adapter fan-out** - Ensures all adapters consume the same document snapshot, prevents drift between vector and keyword channels.

3. **Gate sync on lifecycleState === 'approved'** - Preserves BOUND-05 ordering (approval before index presence), prevents unapproved content from being indexed.

4. **Use SHA-256 for content hash** - Provides deterministic change detection, compatible with existing embeddingCache hash pattern.

5. **Adapter contract with sync/remove methods** - Idempotent interface allows future adapters (graph, etc.) to plug into same pipeline.

## Key Links Verified

- ✓ `pipeline.ts` normalizes through `normalize.ts` before adapter fan-out (line 150)
- ✓ `pipeline.ts` persists sync metadata on `KnowledgeRecord.indexState` (lines 189-197)
- ✓ Tests prove unchanged approved content is no-op (pipeline.test.ts idempotency test)
- ✓ Tests prove non-approved content has index state removed (pipeline.test.ts lifecycle gating tests)

## Known Stubs
None - all implemented functionality is wired and tested.

## Threat Flags
None - no new security-relevant surface beyond the planned index state persistence which follows existing patterns.

## Test Results
- ✓ 11/11 normalize tests pass
- ✓ 6/6 pipeline tests pass
- ✓ All existing tests still pass (151 total)
- ✓ TypeScript compilation succeeds with no errors

## Self-Check: PASSED
- ✓ All created files exist and are committed
- ✓ All commits exist in git log
- ✓ Acceptance criteria met:
  - KnowledgeIndexStateRecord and indexState field exist in store.ts
  - NormalizedIndexDocument and IndexAdapter exist in types.ts
  - normalizeKnowledgeIndexDocument with contentHash and canonicalText exists
  - syncKnowledgeIndex and reconcileKnowledgeIndexes exist in pipeline.ts
  - Tests verify deterministic normalization and idempotent pipeline behavior

**File existence verified:**
- FOUND: packages/server/src/lib/indexing/types.ts
- FOUND: packages/server/src/lib/indexing/normalize.ts
- FOUND: packages/server/src/lib/indexing/pipeline.ts
- FOUND: packages/server/src/lib/indexing/normalize.test.ts
- FOUND: packages/server/src/lib/indexing/pipeline.test.ts

**Commits verified:**
- FOUND: 0216828 - test(08-01): add failing tests for deterministic normalization and pipeline orchestration
- FOUND: 5104e43 - feat(08-01): implement persisted index state, normalization, and sync/reconcile pipeline
