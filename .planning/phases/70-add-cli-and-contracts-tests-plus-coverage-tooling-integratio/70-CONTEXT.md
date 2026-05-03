# Phase 70: Add Retrieval and Indexing Core Tests - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Derived from test coverage analysis - business logic core

<domain>
## Phase Boundary

Phase 70 should add tests for uncovered retrieval and indexing modules to protect core business logic.

This phase is about ensuring the retrieval pipeline and indexing infrastructure are thoroughly tested.

In scope:
- `retrieval/orchestrator.ts` - Retrieval orchestration flow
- `retrieval/semantic.ts` - Semantic recall
- `retrieval/merge.ts` - Multi-path merge strategy
- `indexing/artifact-pipeline.ts` - Artifact indexing flow
- `persistence/postgres-store.ts` - Database store operations

Out of scope:
- Adding new retrieval features
- Modifying retrieval algorithms
- Performance optimization
- Integration tests with real embeddings

</domain>

<decisions>
## Implementation Decisions

### Why retrieval and indexing are grouped

- Both are core business logic that directly affect user experience
- Retrieval quality depends on correct indexing
- These modules have partial test coverage that needs completion
- They share common test utilities (mock embeddings, test fixtures)

### Working assumptions

- Existing retrieval tests in `intent.test.ts`, `keyword.test.ts`, etc. are good patterns
- Mock embeddings are sufficient for unit tests
- The retrieval pipeline structure is stable

### Target direction

- Complete test coverage for all retrieval modes (semantic, keyword, hybrid, graph-assisted)
- Test indexing pipeline from submission to searchable state
- Test persistence layer CRUD operations

</decisions>

<code_context>
## Existing Code Insights

### Retrieval module coverage status

```
packages/server/src/lib/retrieval/
├── orchestrator.ts        ❌ No tests - Main orchestration
├── semantic.ts            ❌ No tests - Semantic recall
├── merge.ts               ❌ No tests - Multi-path merge
├── filters.ts             ❌ No tests - Result filtering
├── pg-vector.ts           ❌ No tests - Vector DB ops
├── pg-keyword.ts          ❌ No tests - Keyword DB ops
├── intent.ts              ✅ Has tests
├── keyword.ts             ✅ Has tests (recall/)
├── graph-assisted.ts      ✅ Has tests (recall/)
├── plan-compiler.ts       ✅ Has tests
├── capsule-recall.ts      ✅ Has tests
├── assembly.ts            ✅ Has tests
├── citations.ts           ✅ Has tests
├── rerank.ts              ✅ Has tests
└── summary.ts             ✅ Has tests
```

### Indexing module coverage status

```
packages/server/src/lib/indexing/
├── artifact-pipeline.ts   ❌ No tests - Artifact indexing
├── boundary-normalize.ts  ❌ No tests
├── types.ts               ❌ No tests (type only, low priority)
├── normalize.ts           ✅ Has tests
├── events.ts              ✅ Has tests
├── reconcile.ts           ✅ Has tests
├── pipeline.ts            ✅ Has tests
└── adapters/
    ├── graph-builders.ts  ❌ No tests
    ├── pg-vector.ts       ❌ No tests
    ├── pg-keyword.ts      ❌ No tests
    ├── index.ts           ❌ No tests
    ├── vector.ts          ✅ Has tests
    ├── keyword.ts         ✅ Has tests
    └── graph.ts           ✅ Has tests
```

### Persistence coverage status

```
packages/server/src/lib/persistence/
├── postgres-store.ts      ❌ No tests - Main DB store
├── schema.ts              ❌ No tests (schema only)
├── backfill-indexes.ts    ❌ No tests
├── create-store.ts        ❌ No tests
├── migrate-candidates.ts  ✅ Has tests
├── migrate-knowledge.ts   ✅ Has tests
└── migrate-artifacts.ts   ✅ Has tests
```

### Existing test patterns to follow

- `retrieval/recall/keyword.test.ts` - Mock database, test SQL generation
- `retrieval/intent.test.ts` - Test intent parsing from seed text
- `indexing/pipeline.test.ts` - Test indexing stages

</code_context>

<specifics>
## Specific Test Files to Create

1. `packages/server/src/lib/retrieval/orchestrator.test.ts`
   ```typescript
   // Test: orchestrateRetrieval() with different modes
   // Test: Mode selection logic (semantic/hybrid/graph-assisted)
   // Test: Result aggregation and ranking
   // Test: Error handling and fallbacks
   ```

2. `packages/server/src/lib/retrieval/semantic.test.ts`
   ```typescript
   // Test: semanticRecall() with mock embeddings
   // Test: Similarity threshold filtering
   // Test: Vector dimension handling
   ```

3. `packages/server/src/lib/retrieval/merge.test.ts`
   ```typescript
   // Test: mergeResults() from multiple recall paths
   // Test: Deduplication logic
   // Test: Score normalization across paths
   // Test: Reranking after merge
   ```

4. `packages/server/src/lib/indexing/artifact-pipeline.test.ts`
   ```typescript
   // Test: Artifact indexing from submission
   // Test: Capsule extraction
   // Test: Graph document generation
   // Test: Index update on revision
   ```

5. `packages/server/src/lib/persistence/postgres-store.test.ts`
   ```typescript
   // Test: CRUD operations with pg-mem
   // Test: Transaction handling
   // Test: Connection error handling
   ```

</specifics>

<deferred>
## Deferred Ideas

- End-to-end retrieval quality tests (use evals/ for this)
- Performance benchmarks
- Stress testing with large datasets
- Real embedding provider integration tests

</deferred>
