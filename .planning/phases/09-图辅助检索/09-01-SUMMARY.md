---
phase: 09-图辅助检索
plan: "01"
title: "Graph adapter seam and internal indexing contracts"
slug: graph-adapter-seam
subsystem: indexing
tags: [graph, indexing, adapters, typescript]
wave: 1
depends_on: []
provides:
  - id: "graph-adapter-contract"
    description: "IndexAdapter.kind widened to include 'graph'"
    interface: "packages/server/src/lib/indexing/types.ts"
  - id: "graph-adapter-implementation"
    description: "Concrete graph adapter with sync/remove seam"
    interface: "packages/server/src/lib/indexing/adapters/graph.ts"
  - id: "vector-adapter-implementation"
    description: "Concrete vector adapter with sync/remove seam"
    interface: "packages/server/src/lib/indexing/adapters/vector.ts"
  - id: "keyword-adapter-implementation"
    description: "Concrete keyword adapter with sync/remove seam"
    interface: "packages/server/src/lib/indexing/adapters/keyword.ts"
affects:
  - "packages/server/src/lib/indexing/pipeline.ts"
  - "packages/server/src/lib/store.ts"
tech_stack:
  added: []
  patterns:
    - "In-memory cache for adapter state tracking"
    - "TDD workflow with RED/GREEN phases"
    - "Idempotent sync based on revision and contentHash"
key_files:
  created:
    - "packages/server/src/lib/indexing/adapters/graph.ts"
    - "packages/server/src/lib/indexing/adapters/graph.test.ts"
    - "packages/server/src/lib/indexing/adapters/vector.ts"
    - "packages/server/src/lib/indexing/adapters/vector.test.ts"
    - "packages/server/src/lib/indexing/adapters/keyword.ts"
    - "packages/server/src/lib/indexing/adapters/keyword.test.ts"
    - "packages/server/src/lib/indexing/events.test.ts"
  modified:
    - "packages/server/src/lib/indexing/types.ts"
    - "packages/server/src/lib/store.ts"
    - "packages/server/src/lib/indexing/pipeline.ts"
decisions: []
metrics:
  duration: "12 minutes"
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_created: 7
  files_modified: 3
  tests_added: 28
  tests_passing: 28
---

# Phase 09 Plan 01: Graph Adapter Seam and Internal Indexing Contracts Summary

Create the internal graph indexing seam required for Phase 9 by widening Phase 8's adapter contracts, restoring missing adapter implementation files, and adding a concrete graph adapter/test surface.

## One-Liner
Implemented graph-capable internal indexing contracts with concrete adapter implementations for vector, keyword, and graph channels using in-memory state tracking and TDD methodology.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test isolation issues with shared adapter caches**
- **Found during:** Task 3
- **Issue:** Adapter tests were failing because the in-memory cache was persisting across test runs, causing `performedWork` to return `false` when it should return `true`
- **Fix:** Added `clearCache()` functions to each adapter (vector, keyword, graph) and called them in `beforeEach()` test hooks to ensure test isolation
- **Files modified:** vector.ts, keyword.ts, graph.ts, vector.test.ts, keyword.test.ts, graph.test.ts
- **Commit:** be6e1f1

**2. [Rule 2 - Auto-add missing critical functionality] Fixed missing graph state in test fixture**
- **Found during:** Task 3 verification
- **Issue:** `events.test.ts` was creating `KnowledgeIndexStateRecord` objects without the required `graph` field, causing TypeScript compilation errors
- **Fix:** Updated the test fixture to include `graph: AdapterSyncState` alongside `vector` and `keyword`
- **Files modified:** packages/server/src/lib/indexing/events.test.ts
- **Commit:** be6e1f1

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | graph.ts | Graph payloads remain server-internal and are not exposed through contracts. The adapter persists extracted-entity data in memory only. |

## Known Stubs

None - all adapters are fully implemented with functional sync/remove behavior.

## Key Implementation Details

### Adapter Contract Widening
- Updated `IndexAdapter.kind` to include `'graph'` alongside `'vector'` and `'keyword'`
- Updated `IndexSyncResult.adapterKind` to include `'graph'`
- Updated `KnowledgeIndexStateRecord` to persist `graph: AdapterSyncState`
- Updated pipeline initialization and reconciliation to handle graph as a first-class adapter

### Vector Adapter
- Generates embeddings from `document.canonicalText`
- Persists vectors in memory keyed by `entryId:revision`
- Implements idempotency based on revision and contentHash matching
- Mirrors to `embeddingCache` for backward compatibility

### Keyword Adapter
- Persists normalized token arrays and per-field token groupings
- Derives field-specific tokens from shortcut, detail, and labels
- Implements idempotency based on revision and contentHash matching
- Stores tokens in memory keyed by `entryId:revision`

### Graph Adapter
- Extracts entities deterministically using bounded heuristics:
  - **service**: Capitalized package-like phrases
  - **tool**: Common CLI/library keywords (npm, pnpm, docker, etc.)
  - **symptom**: Error/problem phrases (error, fail, timeout, etc.)
  - **root-cause**: Causal phrases (because, caused by, due to)
  - **fix**: Remediation phrases (fix, use, enable, set, add)
  - **environment**: Context markers (ci, local, production, etc.)
- Creates simple typed relations (fixed-by, uses-tool) based on entity co-occurrence
- Maintains global graph index for cross-entry traversal
- Implements idempotency based on revision and contentHash matching

### Test Infrastructure
- All adapters include `clearCache()` functions for test isolation
- Tests verify sync/remove behavior, idempotency, and adapter contract compliance
- Tests run in ~100ms for all 28 adapter tests

## Self-Check: PASSED

**Files created:**
- FOUND: packages/server/src/lib/indexing/adapters/graph.ts
- FOUND: packages/server/src/lib/indexing/adapters/graph.test.ts
- FOUND: packages/server/src/lib/indexing/adapters/vector.ts
- FOUND: packages/server/src/lib/indexing/adapters/vector.test.ts
- FOUND: packages/server/src/lib/indexing/adapters/keyword.ts
- FOUND: packages/server/src/lib/indexing/adapters/keyword.test.ts

**Tests passing:**
- FOUND: 28 adapter tests passing
- FOUND: pipeline tests passing

**TypeScript compilation:**
- NOTE: Pre-existing type errors in orchestrator.ts and operations.ts are outside the scope of this plan
- FOUND: No new type errors introduced by adapter implementations

## Commits

- `75edd9f` test(09-01): add failing tests for graph adapter
- `987dcc3` test(09-01): update vector and keyword adapter tests to expect IndexAdapter contract
- `5d82030` feat(09-01): widen internal index-state contracts to include graph sync state
- `be6e1f1` feat(09-01): implement concrete vector, keyword, and graph adapter modules

## Success Criteria

- [x] Internal indexing contracts support `graph` beside `vector` and `keyword`
- [x] Concrete adapter implementation files exist for all three channels
- [x] Adapter-focused tests can validate graph sync/remove behavior without missing-file failures
- [x] All adapter tests pass (28 tests)
- [x] Pipeline tests pass with graph adapter included
