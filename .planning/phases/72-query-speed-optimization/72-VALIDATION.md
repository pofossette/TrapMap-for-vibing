# Phase 72: Query Speed Optimization -- Validation

**Status:** PARTIAL (4 resolved, 2 warnings)
**Date:** 2026-05-04
**Validator:** gsd-nyquist-auditor

## Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| PERF-01 | Retrieval query speed optimization | WARNING |
| PERF-02 | Database query optimization | WARNING |

## Gap Verification Map

| # | Gap | Test File | Type | Command | Status |
|---|-----|-----------|------|---------|--------|
| 1 | Benchmarking framework measures retrieval performance | `src/lib/validation/phase72-gap-validation.test.ts` | unit | `cd packages/server && npx vitest run src/lib/validation/phase72-gap-validation.test.ts` | green |
| 2 | Batch embedding functions skip computation for cached entries | `src/lib/validation/phase72-gap-validation.test.ts` | unit | `cd packages/server && npx vitest run src/lib/validation/phase72-gap-validation.test.ts` | green |
| 3 | Reranking early termination handles boundary equality | `src/lib/validation/phase72-gap-validation.test.ts` | unit | `cd packages/server && npx vitest run src/lib/validation/phase72-gap-validation.test.ts` | green |
| 4 | DB-level vector search constructs correct SQL with cosine distance | `src/lib/validation/phase72-gap-validation.test.ts` | unit | `cd packages/server && npx vitest run src/lib/validation/phase72-gap-validation.test.ts` | green |
| 5 | USE_DB_SEARCH feature flag controls search path | `src/lib/validation/phase72-gap-validation.test.ts` | unit | `cd packages/server && npx vitest run src/lib/validation/phase72-gap-validation.test.ts` | green |
| 6 | GIN index definition exists in schema for knowledge_keywords.tokens | `src/lib/validation/phase72-gap-validation.test.ts` | unit | `cd packages/server && npx vitest run src/lib/validation/phase72-gap-validation.test.ts` | green |

## Test Summary

**Total gap tests:** 25 assertions across 6 describe blocks
**All passing:** YES (1513 server tests, 0 failures)

### Gap 1: Benchmarking Framework (5 tests)
- `totalLatencyMs` equals sum of all individual step latencies
- `measurePipelineStep` returns both result and non-negative latency
- `measurePipelineStep` captures latency for slow operations (>=10ms for 15ms delay)
- `compareBenchmarkResults` shows positive improvement when after is faster
- `formatBenchmarkReport` includes all step names and memory info

**Result:** GREEN. The benchmarking framework correctly measures pipeline step latencies, computes totals as sums of steps, and produces formatted reports.

### Gap 2: Batch Embedding Functions (3 tests)
- `getBatchEmbeddings` does NOT call `generateEmbedding` for entries with valid cache
- `getBatchEmbeddings` calls `generateEmbedding` for uncached entries (cache miss path works)
- `optimizedSemanticRecall` returns sorted entries by cosine similarity and tracks cache stats

**Result:** GREEN. Cache hits avoid embedding computation. Cache misses trigger `generateEmbedding`. Scores are sorted by cosine similarity correctly.

### Gap 3: Reranking Early Termination (4 tests)
- Includes candidate whose score equals the threshold exactly (boundary equality)
- Handles threshold of 1.0 -- only perfect-score candidates pass
- Early termination does not alter rerank scoring of surviving candidates
- Early termination preserves cross-channel boost behavior

**Result:** GREEN. Early termination correctly uses `>=` comparison (includes boundary). Surviving candidates get full rerank scoring.

### Gap 4: DB-Level Vector Search (6 tests)
- Uses cosine distance operator (`<=>`) in both SELECT and ORDER BY
- Applies `status = 'synced'` filter by default
- Parameterizes all user inputs (no SQL injection vectors)
- `ensureVectorIndex` creates HNSW index with m=16, ef_construction=64
- Formats query vector as array literal for pgvector
- Clamps similarity scores to [0, 1] range

**Result:** GREEN. SQL query construction is correct and safe. HNSW index parameters match specification.

### Gap 5: USE_DB_SEARCH Feature Flag (5 tests)
- Returns disabled when `USE_DB_SEARCH` env is not set
- Returns enabled when `USE_DB_SEARCH=true`
- Returns disabled for `USE_DB_SEARCH=false` (strict string check)
- Returns disabled for `USE_DB_SEARCH=1` (not just truthy)
- Requires both env flag AND pool availability for DB search

**Result:** GREEN. Feature flag uses strict `=== 'true'` comparison. Pool availability is a separate requirement.

### Gap 6: GIN Index in Schema (2 tests)
- `knowledgeKeywords` table object exists and has a `tokens` column
- GIN index definition (`idx_knowledge_keywords_tokens_gin`) exists in schema source

**Result:** GREEN. Schema defines the GIN index on `tokens` column using `index().using('gin', table.tokens)`.

## Warnings

### WARNING: Optimizations not fully wired into production pipeline

The milestone audit noted that some optimizations (batch embeddings, early termination, `ensureVectorIndex`) are implemented but NOT fully wired into the production retrieval pipeline. Specifically:

1. **`getBatchEmbeddings` / `optimizedSemanticRecall`**: These functions exist in `semantic.ts` and work correctly in isolation, but the orchestrator's `semanticRecall()` function (line 555 of `orchestrator.ts`) still uses the per-entry `getEntryEmbedding()` in the in-memory fallback path, not the batch-optimized version. The batch path is only used indirectly.

2. **`earlyTerminationThreshold`**: The `rerankCandidates` function accepts this config option, but the orchestrator never passes it when calling `rerankCandidates`. The optimization is available but not activated in the production code path.

3. **`ensureVectorIndex`**: The HNSW index creation function exists in `db-search.ts` but is not called during server startup or in any initialization path. It must be called manually or wired into startup.

These are design-level gaps (functions exist and work but are not called from the production path), not implementation bugs. The DB search path via `USE_DB_SEARCH` feature flag IS properly wired (verified in Gap 5).

### WARNING: pg-keyword tests require live database

The `pg-keyword.test.ts` tests are wrapped in `describeIfDb` and are skipped when `DATABASE_URL` is not set. The GIN index existence is verified via source code analysis rather than runtime verification. For full confidence, these tests should be run against a live PostgreSQL instance with the schema applied.

## Files for Commit

- `packages/server/src/lib/validation/phase72-gap-validation.test.ts`
- `.planning/phases/72-query-speed-optimization/72-VALIDATION.md`
