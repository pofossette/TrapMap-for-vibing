# Phase 72: Query Speed Optimization - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Performance optimization phase

<domain>
## Phase Boundary

Phase 72 should optimize retrieval query speed by reducing vector search latency and reranking overhead.

This phase is about making the retrieval pipeline faster without changing its behavior.

In scope:
- Vector search latency optimization
- Database query optimization (indexing, query tuning)
- Reranking overhead reduction
- Query plan analysis and optimization
- Caching strategy for frequently accessed data

Out of scope:
- Adding new retrieval features
- Changing search result quality/ranking algorithm
- Memory optimization (Phase 73)
- Code cleanup (Phase 74)

</domain>

<decisions>
## Implementation Decisions

### Why query speed optimization comes before memory optimization

- Query speed is user-facing, memory is operational
- Faster queries may reduce memory pressure anyway
- Performance metrics are easier to measure than memory usage
- Query optimization may inform memory optimization strategies

### Working assumptions

- Current retrieval latency is measurable and can be benchmarked
- Database has standard indexes but may need optimization
- Vector search uses pgvector extension
- Reranking is CPU-bound and may benefit from optimization

### Target direction

- Measure current query latency baseline
- Identify slowest queries via logging/profiling
- Optimize database indexes for common query patterns
- Consider caching for frequently accessed embeddings
- Reduce unnecessary work in reranking

</decisions>

<code_context>
## Existing Code Insights

### Retrieval Pipeline Structure

```
packages/server/src/lib/retrieval/
├── orchestrator.ts      # Main retrieval orchestration
├── semantic.ts          # Vector similarity search
├── merge.ts             # Multi-path result merge
├── rerank.ts            # Result reranking
├── filters.ts           # Result filtering
├── assembly.ts          # Final result assembly
└── recall/
    ├── semantic.ts      # Semantic recall
    ├── keyword.ts       # Keyword recall
    └── graph-assisted.ts # Graph-assisted recall
```

### Database Query Locations

```
packages/server/src/lib/
├── retrieval/
│   ├── pg-vector.ts     # Vector DB queries
│   └── pg-keyword.ts    # Keyword DB queries
├── knowledge/
│   └── pg-repository.ts # Knowledge entry queries
└── persistence/
    └── postgres-store.ts # General DB operations
```

### Current Optimization Opportunities

1. **Vector Search**: pgvector index usage, embedding cache
2. **Keyword Search**: Full-text search index, query optimization
3. **Reranking**: Batch processing, early termination
4. **Merge**: Deduplication efficiency, score normalization caching
5. **Assembly**: Citation lookup batching

</code_context>

<specifics>
## Specific Optimization Targets

### 1. Vector Search Latency (PERF-01)

- Review pgvector index configuration (IVFFlat vs HNSW)
- Consider embedding cache hit rate
- Profile vector similarity calculation

### 2. Database Query Optimization (PERF-02)

- Analyze slow queries via EXPLAIN ANALYZE
- Add missing indexes for common filter combinations
- Optimize JOIN patterns in retrieval queries
- Consider query result caching

### 3. Reranking Overhead

- Profile reranking time vs retrieval time
- Consider batch reranking for multiple results
- Early termination for low-scoring candidates

</specifics>

<deferred>
## Deferred Ideas

- Elasticsearch/OpenSearch integration
- Separate read replica for search queries
- GPU acceleration for vector search
- Query result caching with TTL

</deferred>
