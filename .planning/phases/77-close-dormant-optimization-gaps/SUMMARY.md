# Phase 77: Close Dormant Optimization Gaps - Summary

**Status:** Complete
**Date:** 2026-05-04
**Commit:** 10fb9c2

## Objective

Wire PERF-01/02/03 dormant optimizations into production pipeline.

## Problem Statement

v1.6 milestone audit found 4 optimization functions that were implemented but never wired into production:
1. `getBatchEmbeddings()` and `optimizedSemanticRecall()` in semantic.ts — exported but never called
2. `earlyTerminationThreshold` in rerank.ts — option defined but never passed by callers
3. `ensureVectorIndex()` in db-search.ts — never called at server startup
4. `reconcileKnowledgeIndexes()` in pipeline.ts — never called from production code

## Changes Implemented

### Plan 01: Wire Batch Embeddings + Optimized Semantic Recall

**File:** `packages/server/src/lib/retrieval/orchestrator.ts`

- Imported `optimizedSemanticRecall` from `./recall/semantic.js`
- Replaced inline embedding computation with `optimizedSemanticRecall()` call in:
  - `semanticRecall()` (in-memory fallback path, line 560)
  - `computeSemanticCandidates()` (hybrid/graph-assisted paths, line 744)
- Reduces per-query overhead from O(n) individual cache lookups to batch processing

### Plan 02: Wire Early Termination Threshold

**Files:** `packages/server/src/lib/retrieval/orchestrator.ts`, `packages/server/src/lib/retrieval/rerank.ts`

- Changed from absolute threshold to relative threshold (0.3 * topScore)
- Prevents filtering out valid results when scores are uniformly low
- Passed `earlyTerminationThreshold: 0.3` to all 3 rerank calls:
  - `hybridRecall()` DB path (line 687)
  - `hybridRecall()` in-memory path (line 717)
  - `graphAssistedRecall()` (line 812)

### Plan 03: Wire ensureVectorIndex at Startup

**File:** `packages/server/src/app.ts`

- Imported `ensureVectorIndex` from `./lib/retrieval/db-search.js`
- Added call in `onReady` hook after PostgreSQL pool initialization (lines 232-238)
- Creates HNSW index on knowledge_embeddings table if not exists
- Enables O(log n) vector similarity search instead of O(n) scans
- Added startup logging: "Vector HNSW index ensured"

### Plan 04: Add Admin Endpoint for reconcileKnowledgeIndexes

**File:** `packages/server/src/routes/maintenance.ts`

- Added `POST /v1/admin/reconcile-knowledge-indexes` endpoint (lines 346-386)
- Requires system-admin privileges
- Calls `reconcileKnowledgeIndexes()` to bulk repair/sync vector, keyword, and graph indexes
- Returns operation metrics: totalEntries, entriesSynced, entriesRemoved, entriesSkipped
- Logs operation with duration for audit trail

## Test Results

- **Total Tests:** 2423 passed, 34 skipped
- **Test Files:** 130 passed, 2 skipped
- **Duration:** 39.27s
- **No regressions detected**

## Verification Checklist

- [x] Orchestrator calls `optimizedSemanticRecall` when processing entries
- [x] Fallback to line-by-line when batch size = 1
- [x] All existing tests pass
- [x] All 3 rerank calls pass threshold parameter
- [x] Index created on first startup if not exists
- [x] No error if index already exists
- [x] Startup log confirms index status
- [x] Admin endpoint for reconcileKnowledgeIndexes accessible to system-admin only

## Files Modified

1. `packages/server/src/app.ts` — ensureVectorIndex at startup
2. `packages/server/src/lib/retrieval/orchestrator.ts` — batch embeddings + early termination
3. `packages/server/src/lib/retrieval/rerank.ts` — relative threshold implementation
4. `packages/server/src/routes/maintenance.ts` — admin reconcile endpoint

## Impact

- **Performance:** Reduced embedding overhead for retrieval queries, faster reranking with early termination
- **Scalability:** HNSW index enables efficient vector search at scale
- **Operations:** Admin endpoint for bulk index reconciliation during maintenance
- **No Breaking Changes:** All modifications are internal optimizations with no API changes

## Gap Closure

| Gap | Before | After |
|-----|--------|-------|
| Batch embeddings | Exported, unused | Called by orchestrator |
| Optimized semantic recall | Exported, unused | Called for in-memory path |
| Early termination | Option ignored | Passed by all callers |
| Vector index creation | Never called | Called at server startup |
| Memory-optimized reconciliation | Never called | Admin endpoint exposed |

Closes PERF-01, PERF-02, PERF-03 gaps identified in v1.6 milestone audit.
