---
phase: 09-图辅助检索
plan: "03"
title: "Graph-assisted recall and orchestrator integration"
slug: graph-assisted-recall-integration
subsystem: retrieval
tags: [graph, retrieval, orchestrator, typescript]
wave: 3
depends_on: [09-02]
provides:
  - id: "graph-assisted-recall"
    description: "Query entity extraction, bounded expansion, and graph candidate scoring"
    interface: "packages/server/src/lib/retrieval/recall/graph-assisted.ts"
  - id: "graph-assisted-orchestrator"
    description: "Graph-assisted mode dispatch replacing 501 placeholder"
    interface: "packages/server/src/lib/retrieval/orchestrator.ts"
affects:
  - "packages/server/src/lib/retrieval/orchestrator.ts"
  - "packages/server/src/lib/retrieval/types.ts"
  - "packages/server/src/lib/retrieval/merge.ts"
tech_stack:
  added: []
  patterns:
    - "TDD workflow with RED/GREEN phases"
    - "Graph-assisted mode as hybrid baseline + graph expansion"
    - "Bounded one-hop graph traversal for hidden-match discovery"
    - "Authorization-safe graph recall intersecting with eligible entries"
key_files:
  created:
    - "packages/server/src/lib/retrieval/recall/graph-assisted.ts"
    - "packages/server/src/lib/retrieval/recall/graph-assisted.test.ts"
  modified:
    - "packages/server/src/lib/retrieval/orchestrator.ts"
    - "packages/server/src/lib/retrieval/types.ts"
    - "packages/server/src/lib/retrieval/merge.ts"
decisions: []
metrics:
  duration: "25 minutes"
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_created: 2
  files_modified: 3
  tests_added: 11
  tests_passing: 11
---

# Phase 09 Plan 03: Graph-Assisted Recall and Orchestrator Integration Summary

Implement actual graph-assisted retrieval by adding bounded query expansion and relationship-assisted recall, then wire it into the orchestrator without changing the existing response contract or authorization order.

## One-Liner

Implemented graph-assisted retrieval with bounded one-hop expansion through graph relationships and full orchestrator integration, replacing the 501 placeholder with a functional hybrid baseline + graph expansion pipeline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed graph expansion logic to support bidirectional relation traversal**
- **Found during:** Task 2 verification
- **Issue:** Initial implementation only looked at direct match entries' relations, missing related entries that had relations pointing to query entities
- **Fix:** Changed expansion logic to look at ALL entries' relations and find connections to query entities from both directions (fromEntity and toEntity)
- **Files modified:** packages/server/src/lib/retrieval/recall/graph-assisted.ts
- **Commit:** daaefca

**2. [Rule 1 - Bug] Fixed scoring to prevent relation-only matches from outranking direct matches**
- **Found during:** Task 2 verification
- **Issue:** Entry with relation weight of 10 was outranking entry with direct entity match due to high relation boost
- **Fix:** Reduced relation boost from 0.1 to 0.01 and capped relation-only matches at 0.5 score to ensure direct matches always rank higher
- **Files modified:** packages/server/src/lib/retrieval/recall/graph-assisted.ts
- **Commit:** daaefca

**3. [Rule 2 - Auto-add missing critical functionality] Fixed NormalizedIndexDocument type compatibility**
- **Found during:** Task 2 verification
- **Issue:** Graph-assisted.ts had its own minimal NormalizedIndexDocument interface that didn't match the full type from indexing/types.ts, causing TypeScript errors
- **Fix:** Removed local interface, imported proper type from indexing/types.ts, and updated toNormalizedDocument and extractQueryEntities functions to create full NormalizedIndexDocument objects
- **Files modified:** packages/server/src/lib/retrieval/recall/graph-assisted.ts
- **Commit:** daaefca

**4. [Rule 2 - Auto-add missing critical functionality] Added graphScore field to MergedCandidate type**
- **Found during:** Task 3 verification
- **Issue:** Adding graph channel support required tracking graph scores in merged candidates
- **Fix:** Added optional graphScore field to MergedCandidate type (optional for backward compatibility with existing tests)
- **Files modified:** packages/server/src/lib/retrieval/types.ts, packages/server/src/lib/retrieval/merge.ts
- **Commit:** 3292d17

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | graph-assisted.ts | Graph recall always intersects graph-derived entry IDs with eligibleEntries before scoring or merge, ensuring T-09-07 mitigation is enforced. |
| threat_flag: elevation_of_privilege | orchestrator.ts | Graph-assisted mode preserves filter-first order by using the same eligible entries as other modes, ensuring T-09-08 mitigation is enforced. |
| threat_flag: tampering | merge.ts, orchestrator.ts | Graph evidence stays server-internal and is only used for score boosting, ensuring T-09-09 mitigation is enforced. |

## Known Stubs

None - all graph-assisted retrieval functionality is fully implemented with working tests.

## Key Implementation Details

### Graph-Assisted Recall Module

**File:** `packages/server/src/lib/retrieval/recall/graph-assisted.ts`

- **Query entity extraction:** Uses shared `extractGraphEntities()` from graph-extract.ts
- **One-hop bounded expansion:** Finds entries directly matching query entities, then expands one hop through typed relations
- **Bidirectional relation traversal:** Looks at ALL entries' relations to find connections from either direction
- **Authorization safety:** Intersects graph-derived entry IDs with eligible entries before returning candidates
- **Scoring strategy:**
  - Direct entity matches: 0.7 base score
  - Relation-only matches: 0.3 base score (capped at 0.5)
  - Relation boost: 0.01 per weight unit (very small to preserve ranking order)
  - Direct matches always outrank relation-only matches

### Orchestrator Integration

**File:** `packages/server/src/lib/retrieval/orchestrator.ts`

- **Graph-assisted mode:** Implemented as `hybrid baseline + graph expansion`
- **Pipeline:**
  1. Run semantic, keyword, and graph recall in parallel
  2. Merge semantic + keyword candidates first
  3. Merge graph candidates with hybrid results
  4. Rerank combined candidates using heuristic boosts
  5. Return scored entries for assembly
- **Response contract:** Preserves existing `globalConstraints`, `projectKnowledge`, `refinementSummary` structure
- **Default mode:** Remains `semantic` when mode is omitted

### Type System Updates

**File:** `packages/server/src/lib/retrieval/types.ts`

- Added `'graph'` to `RecallChannel` type
- Added optional `graphScore` field to `MergedCandidate` type (backward compatible)

### Merge Module Updates

**File:** `packages/server/src/lib/retrieval/merge.ts`

- Updated mergeCandidates to include `graphScore: 0` in candidate creation
- Added `mergeCandidatesWithGraph` function in orchestrator to combine graph evidence

### Test Coverage

**graph-assisted.test.ts (11 tests):**
- Query entity extraction from search seed
- Empty query handling
- Multiple entity type extraction
- One-hop bounded expansion through entity relationships
- One-hop limit (no multi-hop traversal)
- Authorization safety (eligible entries intersection)
- Unauthorized entries never appear even with strong graph links
- Hidden-match discovery through relationship signals
- Ranking by combined entity match and relation strength
- Higher score for direct entity matches
- Score boost based on relation support count

**All existing route and CLI tests pass**, confirming graph-assisted mode works through API boundaries without breaking existing functionality.

## Self-Check: PASSED

**Files created:**
- FOUND: packages/server/src/lib/retrieval/recall/graph-assisted.ts
- FOUND: packages/server/src/lib/retrieval/recall/graph-assisted.test.ts

**Files modified:**
- FOUND: packages/server/src/lib/retrieval/orchestrator.ts
- FOUND: packages/server/src/lib/retrieval/types.ts
- FOUND: packages/server/src/lib/retrieval/merge.ts

**Tests passing:**
- FOUND: 11 new graph-assisted tests passing
- FOUND: All existing route tests passing
- FOUND: All existing CLI tests passing

**TypeScript compilation:**
- NOTE: Pre-existing type errors in indexing/adapters/index.ts, events.test.ts, and retrieval.test.ts are outside the scope of this plan
- FOUND: No new type errors introduced by graph-assisted implementation

**Acceptance criteria met:**
- FOUND: test -f packages/server/src/lib/retrieval/recall/graph-assisted.test.ts
- FOUND: rg -n "graphAssistedRecall|eligibleEntries|one hop|relationship" packages/server/src/lib/retrieval/recall/graph-assisted.test.ts
- FOUND: test -f packages/server/src/lib/retrieval/recall/graph-assisted.ts
- FOUND: rg -n "export async function graphAssistedRecall|extractGraphEntities" packages/server/src/lib/retrieval/recall/graph-assisted.ts
- FOUND: rg -n "case 'graph-assisted'" packages/server/src/lib/retrieval/orchestrator.ts
- FOUND: pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts (all route tests pass)
- FOUND: pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts (all CLI tests pass)

## Commits

- `a9e73d1` test(09-03): add failing tests for graph-assisted recall
- `daaefca` feat(09-03): implement graph-assisted recall as bounded internal channel
- `3292d17` feat(09-03): replace graph-assisted 501 path with orchestrated graph-assisted retrieval

## Success Criteria

- [x] `mode: 'graph-assisted'` no longer returns a placeholder error
- [x] Graph-assisted recall can surface indirect but authorized matches
- [x] Public response shape and business scope semantics remain unchanged
