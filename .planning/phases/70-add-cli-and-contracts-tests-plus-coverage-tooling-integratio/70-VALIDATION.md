# Phase 70 VALIDATION

**Phase:** 70 -- Add Retrieval and Indexing Core Tests + Business Logic Coverage
**Requirement:** TEST-03
**Date:** 2026-05-04
**Status:** GREEN

## Verification Map

| Task ID | Requirement | Test File | Command | Status |
|---------|-------------|-----------|---------|--------|
| 70-G1 | Retrieval merge strategies (union, intersect, weighted) | `packages/server/src/lib/validation/phase70-gap1-merge.test.ts` | `cd packages/server && npx vitest run src/lib/validation/phase70-gap1-merge.test.ts` | green |
| 70-G2 | Semantic recall returns relevant results with correct scoring | `packages/server/src/lib/validation/phase70-gap2-semantic.test.ts` | `cd packages/server && npx vitest run src/lib/validation/phase70-gap2-semantic.test.ts` | green |
| 70-G3 | Retrieval orchestrator combines multiple recall paths correctly | `packages/server/src/lib/validation/phase70-gap3-orchestrator.test.ts` | `cd packages/server && npx vitest run src/lib/validation/phase70-gap3-orchestrator.test.ts` | green |
| 70-G4 | Artifact pipeline processes indexing artifacts end-to-end | `packages/server/src/lib/validation/phase70-gap4-artifact.test.ts` | `cd packages/server && npx vitest run src/lib/validation/phase70-gap4-artifact.test.ts` | green |
| 70-G5 | Postgres store CRUD operations work with proper error handling | `packages/server/src/lib/validation/phase70-gap5-postgres.test.ts` | `cd packages/server && npx vitest run src/lib/validation/phase70-gap5-postgres.test.ts` | green |

## Validation Tests Summary

**Total validation tests:** 41 (all passing)
**Original tests:** 140 (all passing)
**Combined:** 181 tests, 0 failures

### Gap 1: Retrieval merge strategies (9 tests)
- UNION: entries from one channel appear when the other is empty
- INTERSECT: shared entry gets combined score from both channels
- WEIGHTED: 100% keyword weight ignores semantic channel
- WEIGHTED: 100% semantic weight ignores keyword channel
- UNION: many entries from both channels preserve all unique entries (dedup)
- Zero score in keyword channel does not suppress semantic entry
- Zero score in semantic channel does not suppress keyword entry
- maxCandidates drops lowest-scoring entries

### Gap 2: Semantic recall scoring (9 tests)
- buildEmbeddingText uses newlines between fields (not spaces)
- computeScore with similarity=0 still applies label+scope boosts (non-zero result)
- computeScore caps at exactly 1.0 with maximum boosts
- cosineSimilarity with large orthogonal vectors returns 0
- optimizedSemanticRecall sorts by score descending (verified with cached vs computed vectors)
- getBatchEmbeddings skips failed embedding computation silently
- cosineSimilarity throws for mismatched dimensions
- cosineSimilarity returns 0 for zero vectors
- computeScore ignores scope boost when scopes has multiple values

### Gap 3: Retrieval orchestrator (6 tests)
- Unknown mode falls back to local (semantic) with fallbackApplied=true
- Graph-assisted mode dispatches to all three recall modules
- Empty snapshot produces empty response with RAG log
- selectRetrievalStrategyV2 always produces capsule route family
- Semantic mode does NOT call keyword or graph recall
- Error during snapshot re-throws and logs the failure

### Gap 4: Artifact pipeline (7 tests)
- Fan-out continues after adapter throws, collecting all results
- All adapters succeeding returns success=true
- Removal propagates artifactId to all adapters
- Override adapters parameter does not mutate registered adapters
- Zero adapters returns success=true with empty results
- Registering new adapters replaces previous registration
- Non-Error thrown by adapter converts to string error message

### Gap 5: Postgres store CRUD (11 tests)
- snapshot returns empty data when no row exists
- snapshot returns stored data after transact writes
- transact rolls back and re-throws on mutator error
- transact releases client even when mutator throws
- nextId generates sequential IDs per prefix independently
- transact returns mutator return value correctly
- close calls pool.end exactly once
- getPool returns the original pool instance
- snapshot handles null data row by returning empty store data
- transact executes BEGIN and COMMIT for successful operations
- transact with existing data provides that data to mutator

## Debug Iterations

| Gap | Iteration | Issue | Resolution |
|-----|-----------|-------|------------|
| G1 | 1 | vi.mock('../retrieval/merge.js') in monolithic file overrode real mergeCandidates | Split into separate files per gap |
| G2 | 1 | optimizedSemanticRecall test had identical vectors, so boosts capped at 1.0 for both entries | Used cached vector for high-boost entry to create real score difference |
| G3 | 1 | vi.clearAllMocks() reset filter mocks to return undefined, breaking empty-path test | Added explicit mockReturnValue([]) for filter mocks in affected test |

## Files for Commit

- `/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/validation/phase70-gap1-merge.test.ts`
- `/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/validation/phase70-gap2-semantic.test.ts`
- `/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/validation/phase70-gap3-orchestrator.test.ts`
- `/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/validation/phase70-gap4-artifact.test.ts`
- `/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/validation/phase70-gap5-postgres.test.ts`
- `/home/wunai/project/TrapMap-for-vibing/.planning/phases/70-add-cli-and-contracts-tests-plus-coverage-tooling-integratio/70-VALIDATION.md`
