---
phase: 77-close-dormant-optimization-gaps
milestone: v1.6
type: gap-closure
priority: high
requires:
  - phase: 72
    provides: Query speed optimizations (batch embeddings, early termination, ensureVectorIndex)
  - phase: 73
    provides: Memory optimization (reconcileKnowledgeIndexes)
provides:
  - Wired batch embeddings into production orchestrator
  - Wired early termination threshold into rerank calls
  - Wired ensureVectorIndex into server startup
  - Wired reconcileKnowledgeIndexes into events.ts OR removed orphaned code
affects: [packages/server/src/lib/retrieval/orchestrator.ts, packages/server/src/lib/retrieval/recall/semantic.ts, packages/server/src/lib/retrieval/rerank.ts, packages/server/src/lib/retrieval/db-search.ts, packages/server/src/lib/indexing/pipeline.ts, packages/server/src/app.ts, packages/server/src/routes/events.ts]
---

# Phase 77: Close Dormant Optimization Gaps

**Goal:** Wire PERF-01/02/03 dormant optimizations into production pipeline.

## Problem Statement

v1.6 milestone audit found 4 optimization functions that were implemented but never wired into production:

1. **PERF-01**: `getBatchEmbeddings()` and `optimizedSemanticRecall()` in `semantic.ts` — exported but never called by orchestrator
2. **PERF-01**: `earlyTerminationThreshold` in `rerank.ts` — option defined but never passed by callers
3. **PERF-02**: `ensureVectorIndex()` in `db-search.ts` — never called at server startup
4. **PERF-03**: `reconcileKnowledgeIndexes()` in `pipeline.ts` — never called from production code

## Gap Analysis

| Gap | File | Line | Current State | Target State |
|-----|------|------|---------------|--------------|
| Batch embeddings | semantic.ts | 206 | Exported, unused | Called by orchestrator when batch processing beneficial |
| Optimized semantic recall | semantic.ts | 270 | Exported, unused | Called by orchestrator for in-memory path |
| Early termination | rerank.ts | 64 | Option ignored | Passed by orchestrator callers |
| Vector index creation | db-search.ts | 233 | Never called | Called at server startup |
| Memory-optimized reconciliation | pipeline.ts | 243 | Never called | Called by events.ts OR removed |

## Implementation Plan

### Plan 01: Wire Batch Embeddings + Optimized Semantic Recall

**Target:** `packages/server/src/lib/retrieval/orchestrator.ts`

- Import `getBatchEmbeddings` and `optimizedSemanticRecall` from `./recall/semantic.js`
- Replace inline `Promise.all(semanticGetEntryEmbedding())` with batch call when entry count > threshold
- Add feature flag `USE_BATCH_EMBEDDINGS` (default: true) for gradual rollout

**Verify:**
- [ ] Orchestrator calls `getBatchEmbeddings` when processing multiple entries
- [ ] Fallback to line-by-line when batch size = 1
- [ ] All existing tests pass
- [ ] New unit test for batch path

### Plan 02: Wire Early Termination Threshold

**Target:** `packages/server/src/lib/retrieval/orchestrator.ts`

- Add `earlyTerminationThreshold` parameter to `rerankCandidates` calls
- Default: 0.3 (skip candidates with score < 30% of top score)
- Make configurable via environment variable

**Verify:**
- [ ] All 3 rerank calls pass threshold parameter
- [ ] Benchmark shows reduced rerank time for large candidate sets
- [ ] No regression in result quality

### Plan 03: Wire ensureVectorIndex at Startup

**Target:** `packages/server/src/app.ts`

- Import `ensureVectorIndex` from `./lib/retrieval/db-search.js`
- Call after database connection established
- Add startup logging for index status

**Verify:**
- [ ] Index created on first startup if not exists
- [ ] No error if index already exists
- [ ] Startup log confirms index status

### Plan 04: Wire or Remove reconcileKnowledgeIndexes

**Option A (Wire):** Update `events.ts` to call `reconcileKnowledgeIndexes` instead of `syncKnowledgeIndex` for batch operations.

**Option B (Remove):** Delete orphaned function and its test.

**Recommendation:** Wire if batch reconciliation is needed; otherwise remove to reduce dead code.

**Verify:**
- [ ] If wired: events.ts calls function with batch size
- [ ] If removed: function and test deleted, no dangling references

## Success Criteria

- [ ] All 4 optimization gaps wired into production pipeline
- [ ] No regressions: 2422+ tests pass
- [ ] Performance benchmarks show improvement OR no degradation
- [ ] VERIFICATION.md confirms gaps closed
