---
phase: 11-索引生命周期集成
plan: "02"
subsystem: "Indexing Lifecycle Integration"
tags: ["indexing", "lifecycle", "update", "deactivate", "TDD"]
dependency_graph:
  requires:
    - "11-01: Bootstrap Adapter Registration and Approval Integration"
  provides:
    - "Complete lifecycle-driven indexing pipeline"
  affects:
    - "Knowledge update route"
    - "Deactivate operation route"
    - "Indexing event layer"
tech_stack:
  added:
    - "Post-commit indexing trigger in knowledge PATCH route"
    - "Post-commit indexing removal in deactivate POST route"
    - "embeddingCache clearing on index removal"
  patterns:
    - "Post-commit event dispatch pattern"
    - "Lifecycle state-driven indexing"
    - "TDD test-first approach"
key_files:
  created:
    - "packages/server/src/routes/knowledge.test.ts"
  modified:
    - "packages/server/src/routes/knowledge.ts"
    - "packages/server/src/routes/operations.ts"
    - "packages/server/src/routes/operations.test.ts"
    - "packages/server/src/lib/indexing/events.ts"
decisions:
  - "Clear embeddingCache when indexState is removed to maintain consistency"
  - "Use post-commit pattern for both update and deactivate mutations (T-11-04, T-11-05)"
  - "Only trigger indexing refresh when post-update state is 'approved' (T-11-04)"
metrics:
  duration: "299s (4.9 minutes)"
  completed_date: "2026-04-15T14:42:34Z"
  tasks: 2
  files_changed: 5
  tests_added: 7
  tests_passing: 45 (6 knowledge + 29 operations + 10 events)
---

# Phase 11 Plan 2: Update and Deactivate Indexing Integration Summary

Wire post-commit indexing refresh/removal into the knowledge update and deactivate mutation paths, with focused route regression coverage.

## One-Liner

Approved knowledge updates now refresh indexes post-commit, and deactivation removes all index artifacts, completing the lifecycle-driven indexing pipeline.

## Implementation Summary

### Task 1: Add Route-Level Tests for Approved Refresh and Deactivate Removal (RED Phase)

**TDD Approach:**
- Created failing tests first (RED phase)
- Tests verify:
  1. Patching an `approved` entry updates its indexed content hash
  2. Patching a non-approved entry does not create index state
  3. Deactivating an indexed entry clears persisted `indexState` and `embeddingCache`

**Files Created:**
- `packages/server/src/routes/knowledge.test.ts` - Full update-path regression coverage (6 tests)

**Files Modified:**
- `packages/server/src/routes/operations.test.ts` - Added deactivation indexing integration test (1 new test)

### Task 2: Wire Update and Deactivate Routes to Post-Commit Index Refresh/Remove Events (GREEN Phase)

**Implementation:**
- **Knowledge PATCH route:** Captured `previousState` and `nextState` inside transaction, then called `runKnowledgeIndexEvent()` after commit only when `nextState === 'approved'`
- **Deactivate POST route:** Captured transition context and dispatched `previousState -> deactivated` event after transaction resolves
- **Events layer:** Extended `remove` action to clear `embeddingCache` in addition to `indexState`

**Key Design Decisions:**
1. **Post-commit pattern prevents nested transactions** (T-11-04, T-11-05) - Domain transaction commits first, indexing runs separately
2. **Approved-only refresh** (T-11-04) - Only emit update events when post-update state remains `approved`
3. **Complete artifact removal** (IDX-06) - Clear both `indexState` and `embeddingCache` on deactivation

**Files Modified:**
- `packages/server/src/routes/knowledge.ts` - Added post-commit indexing for approved updates
- `packages/server/src/routes/operations.ts` - Added post-commit indexing for deactivation
- `packages/server/src/lib/indexing/events.ts` - Clear embeddingCache on remove action

## Deviations from Plan

### Auto-Fixed Issues

**1. [Rule 1 - Bug] EmbeddingCache Not Cleared on Index Removal**
- **Found during:** Task 2 verification
- **Issue:** Tests expected `embeddingCache` to be cleared when `indexState` is removed, but events.ts only cleared `indexState`
- **Fix:** Extended `remove` case in `runKnowledgeIndexEvent` to set `entry.embeddingCache = null`
- **Files modified:** `packages/server/src/lib/indexing/events.ts`

**2. [Rule 3 - Blocking Issue] EmbeddingCacheRecord Type Incomplete in Tests**
- **Found during:** Task 2 TypeScript verification
- **Issue:** Test fixtures provided only `vector` field but `EmbeddingCacheRecord` requires `textHash`, `createdAt`, and `revision`
- **Fix:** Updated test fixtures in both `knowledge.test.ts` and `operations.test.ts` to include all required fields
- **Files modified:** `packages/server/src/routes/knowledge.test.ts`, `packages/server/src/routes/operations.test.ts`

## Known Stubs

**None** - All implemented features are wired and functional. Indexing refreshes on approved updates, deactivation removes indexes, and non-approved updates remain no-ops.

## Known Issues

**Pre-existing Adapter Test TypeScript Errors:**
- The adapter test files (`vector.test.ts`, `keyword.test.ts`) have TypeScript errors from Phase 11-01
- These tests call legacy `upsert(entry, document)` methods that don't match the new `IndexAdapter` interface
- **Impact:** Adapter tests have TypeScript compilation errors but runtime tests pass
- **Priority:** Low - Not introduced by this plan; documented in 11-01-SUMMARY.md
- **Resolution:** Update adapter tests to use exported functions instead of direct adapter method calls

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: post_commit | `packages/server/src/routes/knowledge.ts` | Update triggers indexing only after transaction commits (T-11-04 mitigated) |
| threat_flag: approved_only | `packages/server/src/routes/knowledge.ts` | Refresh only emitted when post-update state is 'approved' (T-11-04 mitigated) |
| threat_flag: post_commit | `packages/server/src/routes/operations.ts` | Deactivation triggers indexing only after transaction commits (T-11-05 mitigated) |
| threat_flag: complete_removal | `packages/server/src/lib/indexing/events.ts` | Index removal clears both indexState and embeddingCache (T-11-06 mitigated) |

## Self-Check: PASSED

**Created Files:**
- ✅ `/home/wunai/gsd-workspaces/rag-enhance/TrapMap-for-vibing/packages/server/src/routes/knowledge.test.ts` - 549 lines, 6 tests passing
- ✅ `/home/wunai/gsd-workspaces/rag-enhance/TrapMap-for-vibing/.planning/phases/11-索引生命周期集成/11-02-SUMMARY.md` - This file

**Modified Files:**
- ✅ `packages/server/src/routes/knowledge.ts` - Added post-commit indexing for approved updates
- ✅ `packages/server/src/routes/operations.ts` - Added post-commit indexing for deactivation
- ✅ `packages/server/src/routes/operations.test.ts` - Added deactivation indexing integration test
- ✅ `packages/server/src/lib/indexing/events.ts` - Clear embeddingCache on remove

**Commits:**
- ✅ `6574dd3` - "test(11-02): add failing tests for approved refresh and deactivate removal (RED phase)"
- ✅ `9c914d4` - "test(11-02): add deactivate indexing test to operations.test.ts (RED phase)"
- ✅ `54818b6` - "feat(11-02): implement update and deactivate indexing integration (GREEN phase)"

**Verification:**
- ✅ All 6 knowledge tests passing
- ✅ All 29 operations tests passing (including new deactivation test)
- ✅ All 10 events tests passing
- ✅ TypeScript compilation successful for our modified files
- ✅ IDX-05 satisfied: Approved updates refresh indexes after commit
- ✅ IDX-06 satisfied: Deactivation removes indexes after commit
- ✅ T-11-04 satisfied: Non-approved updates remain indexing no-ops
- ✅ T-11-05 satisfied: Post-commit pattern prevents nested transactions for updates
- ✅ T-11-06 satisfied: Post-commit pattern prevents nested transactions for deactivation

**Requirements Traceability:**
- ✅ IDX-05: Knowledge updates refresh indexes for approved entries
- ✅ IDX-06: Knowledge deactivation removes index state and artifacts

## Success Criteria Met

- ✅ `PATCH /v1/knowledge/:entryId` refreshes indexes only for approved entries and only after commit
- ✅ `POST /v1/operations/knowledge/:entryId/deactivate` removes index state and embeddingCache after commit
- ✅ Route regression coverage exists for both knowledge update and deactivate integration paths

## Next Steps

**Phase 11 Complete:** The lifecycle-driven indexing pipeline is now fully integrated:
- Approval triggers index creation (11-01)
- Approved updates trigger index refresh (11-02)
- Deactivation triggers index removal (11-02)

All IDX-03 through IDX-06 requirements are satisfied. The indexing system is ready for production use.
