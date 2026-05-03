# Phase 66: Boundary-aware Retrieval Completion - Research

**Gathered:** 2026-05-03
**Status:** Research complete

## Executive Summary

Phase 66 completes the unfinished work from Phase 54. While Phase 54 implemented boundary matching logic internally, it did NOT wire the boundary schemas into the public API contracts. The `boundaryContextSchema` and `boundaryExplanationSchema` exist in `boundary.ts` but are not added to `retrievalQuerySchema` or `retrievalMatchSchema`.

## Gap Analysis

### What Phase 54 Built (Internal Implementation)

| Component | File | Status |
|-----------|------|--------|
| `filterByBoundary()` | `boundary-match.ts` | ✅ Complete |
| `computeBoundaryScoreDelta()` | `boundary-match.ts` | ✅ Complete |
| `buildBoundaryExplanation()` | `boundary-match.ts` | ✅ Complete |
| `filterByBoundaryContext()` wrapper | `filters.ts` | ✅ Complete |
| Boundary scoring in rerank | `rerank.ts` | ✅ Complete |
| Orchestrator boundary filter step | `orchestrator.ts` | ✅ Complete |

### What Phase 54 Missed (API Contract Integration)

| Requirement | Expected | Actual | Gap |
|-------------|----------|--------|-----|
| BOUND-04: Accept boundary context as input | `retrievalQuerySchema` includes `boundaryContext?: BoundaryContext` | `boundaryContextSchema` exists in `boundary.ts` but NOT in `retrievalQuerySchema` | **Missing** |
| BOUND-05: Include boundary explanation in response | `retrievalMatchSchema` includes `boundaryExplanation?: BoundaryExplanation` | `boundaryExplanationSchema` exists in `boundary.ts` but NOT in `retrievalMatchSchema` | **Missing** |
| Back-reference queries in production | `findEntriesByBoundaryConstraint` consumed by retrieval | Exists in `boundary-query.ts` but not used by orchestrator | **Not wired** |

## Success Criteria Mapping

### 1. Retrieval accepts boundary context (platform, versions, environment) as input

**Current State:**
- `boundaryContextSchema` defined in `packages/contracts/src/domain/boundary.ts:173-177`
- `retrievalQuerySchema` in `retrieval.ts:57-64` does NOT include `boundaryContext`

**Required Change:**
```typescript
// In packages/contracts/src/domain/retrieval.ts
export const retrievalQuerySchema = z.object({
  seed: z.string().min(1).max(2000),
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  maxResults: z.number().int().min(1).max(50).default(10),
  includeRefinement: z.boolean().default(true),
  includeSummary: z.boolean().default(false),
  mode: retrievalQueryModeSchema.default('semantic'),
  boundaryContext: boundaryContextSchema.optional(), // ADD THIS
});
```

### 2. Required constraint mismatch: entry excluded from results

**Current State:** ✅ Implemented
- `filterByBoundary()` in `boundary-match.ts:116-148` correctly filters entries with unsatisfied version constraints
- `filterByBoundaryContext()` in `filters.ts:106-114` is called by orchestrator

**No changes needed** - this is working.

### 3. Excluded constraint match: entry penalized in ranking

**Current State:** ✅ Implemented
- `computeBoundaryScoreDelta()` in `boundary-match.ts:161-218` applies `-0.15` penalty for exclusion matches
- Called by `rerankCandidates()` in `rerank.ts:120-124`

**No changes needed** - this is working.

### 4. Preferred constraint match: entry boosted in ranking

**Current State:** ✅ Implemented
- `computeBoundaryScoreDelta()` applies `+0.10` boost for context matches
- Working as intended

**No changes needed** - this is working.

### 5. API response includes `boundary_explanation` field

**Current State:** ❌ NOT in API contract
- `buildBoundaryExplanation()` in `boundary-match.ts:228-301` builds the explanation
- `ScoredEntry.boundaryExplanation` is typed in `types.ts:44`
- BUT `retrievalMatchSchema` in `retrieval.ts:66-78` does NOT include `boundaryExplanation`

**Required Change:**
```typescript
// In packages/contracts/src/domain/retrieval.ts
export const retrievalMatchSchema = z.object({
  entryId: entityIdSchema,
  scope: scopeSchema,
  requiredLevel: securityLevelSchema,
  shortcut: z.string(),
  detail: z.string(),
  labels: z.array(labelSchema),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  citation: retrievalCitationSchema.optional(),
  conflicts: z.array(conflictHintSchema).optional(),
  boundaryExplanation: boundaryExplanationSchema.optional(), // ADD THIS
});
```

**Also Required:**
- Update `assembly.ts:toRetrievalMatch()` to build and attach `boundaryExplanation`
- Pass `boundaryContext` through `assembleResponseBuckets()` so explanations can be built

### 6. Back-reference queries consumed by production retrieval code

**Current State:** ⚠️ Exists but not wired
- `findEntriesByBoundaryConstraint()` in `boundary-query.ts:33-56` - scans indexed facets
- `findEntriesByGraphNode()` in `boundary-query.ts:66-81` - queries graph nodes
- `findEntriesByBoundaryConstraints()` in `graphology.ts:411-449` - compound constraint lookup
- **NOT consumed by orchestrator or any production path**

**Required Change:**
Wire these helpers into production retrieval. Possible use cases:
1. **Admin boundary search:** New endpoint to find entries matching boundary constraints
2. **Pre-filtering optimization:** Use graph index for fast candidate shortlisting before semantic recall
3. **Conflict detection:** Find entries with overlapping boundaries to detect potential conflicts

**Recommendation:** Focus on use case 1 (admin boundary search) as a new route, since the primary retrieval pipeline already has boundary filtering via `filterByBoundary()`.

## Key Files to Modify

| File | Changes Required |
|------|------------------|
| `packages/contracts/src/domain/retrieval.ts` | Add `boundaryContext` to query schema, `boundaryExplanation` to match schema |
| `packages/server/src/lib/retrieval/assembly.ts` | Build and attach boundary explanations to matches |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Pass `boundaryContext` to assembly functions |
| `packages/server/src/routes/retrieval.ts` | Route already uses `retrievalQuerySchema.parse()` - no changes needed if schema is updated |

## Dependencies

### Phase 53: Boundary Indexing & Graph Integration (Complete)

- Graph node kinds: `boundary-context`, `boundary-version`, `boundary-platform`
- Relation types: `applies-in`, `requires-version`, `excludes-context`, `excludes-version`
- `HARD_RELATION_TYPES` includes `requires-version`
- Facet index in keyword adapter for fast filtering
- Back-reference query helpers in `graphology.ts` and `boundary-query.ts`

### Phase 54: Boundary-aware Retrieval (Partially Complete)

- Internal boundary matching logic complete
- API contract integration incomplete (the gap this phase fills)

## Testing Strategy

### Existing Tests (All Passing)
- `packages/server/src/lib/retrieval/boundary-match.test.ts` - 26 tests for core logic
- `packages/contracts/src/domain/boundary.test.ts` - Schema validation tests

### New Tests Required
1. **Contract tests:** Verify `retrievalQuerySchema.parse()` accepts `boundaryContext`
2. **Contract tests:** Verify `retrievalMatchSchema.parse()` accepts `boundaryExplanation`
3. **Integration tests:** End-to-end retrieval with boundary context produces explanations
4. **Route tests:** Verify route passes boundary context to orchestrator

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change to `retrievalMatchSchema` | Existing clients may not expect new field | Field is optional, backward compatible |
| Performance impact of building explanations | Added latency per match | Explanations only built when boundary context provided |
| Back-reference query integration scope creep | May expand phase scope | Limit to one concrete use case (admin search) |

## Recommended Task Breakdown

### Wave 1: API Contract Integration (BOUND-04, BOUND-05)
1. Add `boundaryContext` to `retrievalQuerySchema`
2. Add `boundaryExplanation` to `retrievalMatchSchema`
3. Export schemas from contracts index (already exported via `boundary.js`)

### Wave 2: Assembly Integration (BOUND-05)
4. Modify `assembleResponseBuckets()` to accept `boundaryContext`
5. Modify `toRetrievalMatch()` to build `boundaryExplanation` when boundary context provided
6. Thread `boundaryContext` from orchestrator to assembly

### Wave 3: Back-reference Query Wiring (BOUND-04)
7. Evaluate production use case for back-reference queries
8. If admin search needed: Add `/admin/boundary-search` route
9. If optimization needed: Wire graph lookup into recall pipeline

### Wave 4: Verification
10. Contract tests for schema changes
11. Integration tests for end-to-end boundary flow
12. Manual verification with running server

## Questions for Planning

1. **Back-reference query priority:** Should we add an admin boundary search endpoint, or is there a more urgent production use case?
2. **Explanation detail level:** Should explanations include WHICH constraints were satisfied/violated, or just a summary?
3. **V2 capsule retrieval:** Should v2 retrieval also support boundary context? (Currently left unchanged per Phase 54 plan)

## References

- Phase 53 Summary: `.planning/phases/53-boundary-indexing-graph-integration/53-01-SUMMARY.md`
- Phase 54 Summary: `.planning/phases/54-boundary-aware-retrieval/54-01-SUMMARY.md`
- Phase 54 Validation: `.planning/phases/54-boundary-aware-retrieval/54-VALIDATION.md`
- Boundary Schema: `packages/contracts/src/domain/boundary.ts`
- Retrieval Contracts: `packages/contracts/src/domain/retrieval.ts`
- Boundary Match Module: `packages/server/src/lib/retrieval/boundary-match.ts`
- Boundary Query Helpers: `packages/server/src/lib/retrieval/boundary-query.ts`
