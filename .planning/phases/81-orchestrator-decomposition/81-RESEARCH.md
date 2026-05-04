# Phase 81: Orchestrator Decomposition — Research Summary

**Gathered:** 2026-05-05
**Research Mode:** Auto-generated context (discuss skipped)

---

## 1. Target File Analysis

### File Stats

| Metric | Value |
|--------|-------|
| **Path** | `packages/server/src/lib/retrieval/orchestrator.ts` |
| **Lines** | 1,195 (actual) vs 1,145 (SPEC estimate) |
| **Size** | 43KB |
| **Exports** | 5 functions |
| **Imports** | 17 modules from contracts, internal libs, and retrieval sub-modules |

### Export Surface (5 functions)

| Export | Lines | Purpose | Consumers |
|--------|-------|---------|-----------|
| `selectRetrievalStrategy()` | 159-177 | V1 mode → strategy mapping | orchestrator.test.ts, phase70-gap3.test.ts |
| `selectRetrievalStrategyV2()` | 188-205 | V2 capsule strategy | orchestrator.test.ts, phase70-gap3.test.ts |
| `searchKnowledge()` | 266-467 | Main V1 retrieval pipeline | lib/retrieval.ts → routes/retrieval.ts |
| `updateEntryEmbeddingCache()` | 990-1012 | Embedding cache refresh | (internal) |
| `searchKnowledgeV2()` | 1036-1195 | Capsule-native retrieval | lib/retrieval.ts → routes/retrieval.ts |

### Internal Functions (Private, by role)

**Routing/Strategy:**
- `V1_MODE_TO_STRATEGY` constant (126-130)
- `getV1ChannelsPlanned()` (135-146)
- `toRoutingTrace()` (97-108)
- `getDbSearchConfig()` (91-95)
- `inferChannelsFromMerged()` (476-487)

**Pipeline Helpers:**
- `timedStep()` (225-244) — timing wrapper for RAG logging

**Recall Coordination:**
- `dispatchByMode()` (500-523) — mode switch
- `semanticRecall()` (540-632) — semantic channel
- `hybridRecall()` (653-776) — semantic + keyword
- `computeSemanticCandidates()` (788-805) — helper for hybrid
- `graphAssistedRecall()` (822-865) — semantic + keyword + graph
- `mergeCandidatesWithGraph()` (875-919) — graph merge helper

**Refinement:**
- `isRefinementAvailable()` (925-927)
- `buildRefinementPrompt()` (932-947)
- `generateRefinement()` (959-984)

### Logical Groupings by Responsibility

```
Lines 1-65:     IMPORTS (shared)
Lines 66-108:   TYPES (RetrievalDecision, DbSearchConfig)
Lines 110-205:  ROUTING/STRATEGY (exports: 2 functions)
Lines 207-244:  PIPELINE HELPERS (timedStep)
Lines 246-487:  V1 PIPELINE CORE (searchKnowledge + helpers)
Lines 489-919:  RECALL COORDINATION (dispatch + 5 recall functions)
Lines 921-984:  REFINEMENT (3 functions)
Lines 986-1012: EMBEDDING CACHE (export: 1 function)
Lines 1014-1195: V2 PIPELINE CORE (searchKnowledgeV2)
```

---

## 2. Dependency Map

### Incoming Dependencies

```
routes/retrieval.ts
    └── lib/retrieval.ts (facade)
            └── retrieval/orchestrator.ts
                    ├── searchKnowledge()
                    └── searchKnowledgeV2()

lib/validation/phase70-gap3-orchestrator.test.ts
    └── retrieval/orchestrator.ts
            ├── searchKnowledge()
            ├── selectRetrievalStrategy()
            └── selectRetrievalStrategyV2()
```

### Outgoing Dependencies (orchestrator.ts imports from)

**From `@trapmap/contracts`:**
- BoundaryExplanation, CapsuleMatch, ProfileHint, RetrievalCitation, RetrievalQuery, RetrievalResponse, RetrievalStrategy, RetrievalV2Query, RetrievalV2Response, RoutingReason
- Zod schemas: capsuleMatchSchema, profileHintSchema, retrievalQuerySchema, retrievalV2QuerySchema

**From internal libs (`../`):**
- `conflict/enrich.js` — enrichMatchesWithConflicts
- `context.js` — ResolvedAuthContext, SkillShareerServices
- `decay/freshness.js` — DEFAULT_FRESHNESS_CONFIG
- `embeddings.js` — generateEmbedding, hashEmbeddingText
- `errors.js` — AppError
- `persistence/postgres-store.js` — PostgresStore
- `rag-log.js` — PipelineStep, RagLogEntry, generateQueryId, logRagRetrieval
- `store.js` — KnowledgeRecord, nowIso

**From retrieval sub-modules (`./`):**
- `assembly.js` — 8 functions
- `boundary-match.js` — buildBoundaryExplanation, computeBoundaryScoreDelta
- `capsule-recall.js` — buildProfileShortlist, getCapsuleRecords, rankCapsules
- `citations.js` — buildCitations
- `db-search.js` — vectorSimilaritySearch
- `filters.js` — filterByBoundaryContext, filterEligibleEntries
- `intent.js` — parseSeedIntent
- `merge.js` — createSemanticCandidate, mergeCandidates, toScoredEntries
- `rerank.js` — rerankCandidates, toScoredEntriesFromReranked
- `summary.js` — buildCapsuleCitations, buildCapsuleSummary, buildSummary
- `types.js` — MergedCandidate, RetrievalPipelineContext, RoutingChannel, ScoredEntry

**From `./recall/` subdirectory:**
- `recall/graph-assisted.js` — graphAssistedRecall
- `recall/keyword.js` — keywordRecall, normalizeQuery
- `recall/pg-keyword.js` — KeywordRecallResult, createPgKeywordRecall
- `recall/semantic.js` — 6 functions

---

## 3. Existing Retrieval Module Structure

```
packages/server/src/lib/retrieval/
├── assembly.ts          # Response assembly (8 exports) — 13KB
├── benchmark.ts         # Performance benchmarking
├── boundary-match.ts    # Boundary scoring logic
├── boundary-query.ts    # Boundary query helpers
├── capsule-recall.ts    # V2 capsule ranking
├── citations.ts         # Citation building (already exists!)
├── db-search.ts         # PostgreSQL vector/keyword search
├── filters.ts           # Eligibility filtering
├── graph-extract.ts     # Graph extraction (21KB)
├── graph-plan-search.ts # GraphRAG plan search
├── intent.ts            # Seed intent parsing
├── merge.ts             # Candidate merging
├── orchestrator.ts      # ← TARGET (43KB, 1195 lines)
├── plan-compiler.ts     # Plan compilation
├── rerank.ts            # Reranking logic (9KB)
├── skill-lookup.ts      # Skill lookup
├── summary.ts           # Summary generation
├── types.ts             # Shared types (245 lines)
└── recall/
    ├── graph-assisted.ts
    ├── keyword.ts
    ├── pg-keyword.ts
    └── semantic.ts
```

**Key Insight:** `citations.ts` already exists. SPEC.md's `citation-builder.ts` suggestion is redundant.

---

## 4. Test File Analysis

### orchestrator.test.ts (833 lines)

| describe() block | Lines | Tests |
|------------------|-------|-------|
| `selectRetrievalStrategy (v1)` | 300-376 | Mode mapping, decision structure |
| `selectRetrievalStrategyV2` | 382-418 | V2 strategy selection |
| `searchKnowledge` | 424-615 | Empty results, mode dispatch, error handling, timing |
| `updateEntryEmbeddingCache` | 621-751 | Cache update scenarios |
| `DB Search Integration` | 757-833 | DB search fallback behavior |

### phase70-gap3-orchestrator.test.ts (375 lines)

Single describe block: "Gap 3: Retrieval orchestrator combines multiple recall paths correctly"

Tests recall path integration with mocks.

---

## 5. Phase 80 Reference Pattern

Phase 80 successfully decomposed `routes/operations.ts` (1680 lines → 9 modules):

**Wave Structure:**
1. **Wave 1:** Core extraction — create sub-modules, convert original to thin router
2. **Wave 2:** Test file split — match test files to module structure
3. **Wave 3:** Final verification — line counts, full test run

**Key Techniques:**
- Thin router pattern: original file becomes pure delegation
- Barrel export (`index.ts`) for clean imports
- Preserve export names for backward compatibility
- Import path adjustments for new directory depth

---

## 6. Recommended Decomposition Strategy

Based on analysis, **different from SPEC.md suggestions**:

### Proposed Module Structure

```
retrieval/
├── orchestrator.ts           # Thin coordinator (~250 lines)
│   └── Exports: searchKnowledge, searchKnowledgeV2, updateEntryEmbeddingCache
│
├── routing.ts                # NEW — Strategy selection (~120 lines)
│   └── Exports: selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace
│
├── recall-coordinator.ts     # NEW — Recall orchestration (~350 lines)
│   └── Exports: dispatchByMode, semanticRecall, hybridRecall, graphAssistedRecall
│
├── refinement.ts             # NEW — Refinement logic (~80 lines)
│   └── Exports: generateRefinement, isRefinementAvailable, buildRefinementPrompt
│
└── (existing modules unchanged)
```

### Why This Differs from SPEC.md

| SPEC.md Suggestion | Issue | Alternative |
|--------------------|-------|-------------|
| `search-strategy.ts` | Routing functions are pure, already tested separately | `routing.ts` (smaller scope) |
| `ranking-service.ts` | Reranking already in `rerank.ts` | N/A — use existing |
| `citation-builder.ts` | `citations.ts` already exists! | N/A — use existing |
| `search-coordinator.ts` | Good idea but unclear split | Keep in orchestrator as thin coordinator |

### Module Responsibilities

**`routing.ts` (~120 lines):**
- `selectRetrievalStrategy()`
- `selectRetrievalStrategyV2()`
- `toRoutingTrace()`
- `V1_MODE_TO_STRATEGY` constant
- `getV1ChannelsPlanned()`
- `RetrievalDecision` type (move from orchestrator)

**`recall-coordinator.ts` (~350 lines):**
- `dispatchByMode()`
- `semanticRecall()`
- `hybridRecall()`
- `computeSemanticCandidates()`
- `graphAssistedRecall()`
- `mergeCandidatesWithGraph()`
- `inferChannelsFromMerged()`
- `getDbSearchConfig()`
- `DbSearchConfig` type

**`refinement.ts` (~80 lines):**
- `generateRefinement()`
- `isRefinementAvailable()`
- `buildRefinementPrompt()`

**`orchestrator.ts` (remaining ~250 lines):**
- `searchKnowledge()` — calls routing + recall-coordinator + refinement
- `searchKnowledgeV2()` — calls routing + capsule-recall
- `updateEntryEmbeddingCache()`
- `timedStep()` helper

---

## 7. Migration Plan (Wave-Based)

### Wave 1: Core Extraction

**Task 1.1:** Create `routing.ts`
- Move strategy functions + constants + types
- Update orchestrator imports

**Task 1.2:** Create `recall-coordinator.ts`
- Move all recall functions + DB config
- Update orchestrator imports

**Task 1.3:** Create `refinement.ts`
- Move refinement functions
- Update orchestrator imports

**Task 1.4:** Slim orchestrator.ts
- Keep only main pipeline functions + timedStep
- Add imports from new modules

### Wave 2: Test Split

**Task 2.1:** Create `routing.test.ts`
- Move `selectRetrievalStrategy (v1)` tests
- Move `selectRetrievalStrategyV2` tests

**Task 2.2:** Create `recall-coordinator.test.ts`
- Move `DB Search Integration` tests
- Add unit tests for dispatchByMode (if needed)

**Task 2.3:** Create `refinement.test.ts`
- Add new tests for refinement functions

**Task 2.4:** Update `orchestrator.test.ts`
- Keep `searchKnowledge` tests
- Keep `updateEntryEmbeddingCache` tests
- Mock new module imports

### Wave 3: Verification

- Run full test suite
- Verify line counts (< 400 each)
- Run `eval:smoke` for behavior validation
- Update any broken imports

---

## 8. Backward Compatibility

### External API Unchanged

```typescript
// lib/retrieval.ts — NO CHANGES NEEDED
export {
  searchKnowledge,
  searchKnowledgeV2,
  updateEntryEmbeddingCache,
} from './retrieval/orchestrator.js';
```

### Internal Functions Become Private

The following private functions will move but remain private:
- `selectRetrievalStrategy()` — currently exported, used by tests only
- `selectRetrievalStrategyV2()` — currently exported, used by tests only

**Decision needed:** Keep these exported for testability, or use `export type { ... }` pattern?

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Circular imports | Medium | High | Use explicit re-exports, avoid cross-dependencies |
| Test mock breakage | High | Medium | Update mock paths in test files |
| Behavior drift | Low | High | Run eval:smoke after each wave |
| Line count blowback | Low | Medium | Aggressive extraction, keep helpers private |

---

## 10. Pre-Plan Checklist

Before writing PLAN.md, confirm:

- [ ] **Routing module location:** `routing.ts` or `strategies/routing.ts`?
- [ ] **Recall module location:** `recall-coordinator.ts` or `recall/index.ts`?
- [ ] **Export strategy:** Keep strategy functions exported or internal?
- [ ] **Test file naming:** Follow module names exactly?
- [ ] **Wave count:** 3 waves like Phase 80, or fewer?

---

## 11. Key Decisions for Planning

1. **Module naming convention:** Use flat `routing.ts` vs nested `strategies/routing.ts`
   - Recommendation: Flat (simpler, matches existing pattern)

2. **Recall coordinator scope:** Include DB search config or keep separate?
   - Recommendation: Include (tightly coupled to recall functions)

3. **Test file strategy:** Split per module or keep combined?
   - Recommendation: Split per module (matches Phase 80 pattern)

4. **Export visibility:** Strategy functions are implementation details
   - Recommendation: Export for testability but document as internal

---

## 12. Success Criteria (from ROADMAP)

- [ ] orchestrator.ts < 400 lines (target: ~250)
- [ ] Each new module < 400 lines
- [ ] Single responsibility per module
- [ ] All existing tests pass
- [ ] Retrieval results unchanged (eval verification)
