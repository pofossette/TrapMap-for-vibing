---
phase: 36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract
plan: 04
status: completed
completed_at: "2026-04-25T00:41:00.000Z"
---

# Summary: Cross-Domain Graph Reconciliation and Startup Hook

## Tasks Completed

### Task 1: Add cross-domain graph reconciliation and stale-state cleanup

**Files created:**
- `packages/server/src/lib/indexing/reconcile.ts` - Cross-domain graph reconciliation module
- `packages/server/src/lib/indexing/reconcile.test.ts` - Test coverage for reconciliation

**Files modified:**
- `packages/server/src/lib/indexing/events.ts` - Added graph document removal on deactivation
- `packages/server/src/lib/indexing/events.test.ts` - Added lifecycle tests for graph document behavior
- `packages/server/src/routes/review.test.ts` - Added route-level tests for graph document removal

**Implementation:**
- `reconcileGraphIndexes({ store })` - Main reconciliation function with automatic snapshot
- `reconcileGraphIndexesFromSnapshot({ store, data })` - Reconciliation with explicit data snapshot
- Two-phase reconciliation: security-sensitive removals first, then rebuild validation
- Approved sources derived from `knowledgeEntries` and `skillArtifacts` with `lifecycleState === 'approved'`
- Uses `buildTrapGraphDocument` and `buildSkillGraphDocument` as pre-persist candidate builders
- Validates rebuild candidates with `assertNoHardDependencyCycles` before persistence
- Rejects cyclic rebuild upserts while keeping stale removals durable

### Task 2: Run graph reconciliation automatically at server startup

**Files created:**
- `packages/server/src/app.test.ts` - Startup hook behavior tests

**Files modified:**
- `packages/server/src/app.ts` - Added onReady hook for graph reconciliation

**Implementation:**
- Second `onReady` hook registered after candidate recovery
- Calls `reconcileGraphIndexes({ store: app.skillShareer.store })`
- Logs result with document counts: removed, rebuilt, unchanged
- Catches and logs errors without failing Fastify startup
- Candidate recovery hook remains intact (separate onReady hook)

## Threat Model Mitigations

| Threat ID | Mitigation |
|-----------|------------|
| T-36-13 | Stale graph documents for deactivated/rejected sources are treated as security-sensitive removals |
| T-36-14 | Rebuild from current source-of-truth records instead of trusting persisted state |
| T-36-15 | Reconciliation errors logged but don't crash startup |
| T-36-16 | Allowed source set derived from current governance metadata |

## Acceptance Criteria Verified

- [x] `packages/server/src/lib/indexing/reconcile.ts` exports `reconcileGraphIndexes` and `reconcileGraphIndexesFromSnapshot`
- [x] References both `knowledgeEntries` and `skillArtifacts`
- [x] Uses `buildTrapGraphDocument` and `buildSkillGraphDocument` as pre-persist candidate builders
- [x] Removes stale documents by comparing `{sourceType, sourceId, revision}` against approved sources
- [x] Contains exact string `assertNoHardDependencyCycles`
- [x] Test verifies stale removals persist when rebuild candidates fail cycle validation
- [x] `packages/server/src/app.ts` contains `reconcileGraphIndexes`, `Graph index reconciliation complete`, and `Graph index reconciliation failed`
- [x] Candidate recovery hook remains intact
- [x] All automated tests pass

## Verification Command

```bash
pnpm --filter @trapmap/server test -- src/lib/indexing/events.test.ts src/routes/review.test.ts src/app.test.ts src/lib/indexing/reconcile.test.ts
```

**Result:** 38 test files, 619 tests passed
