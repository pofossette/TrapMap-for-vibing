---
phase: 10-回答与引用
plan: "02"
subsystem: retrieval-citations
tags: [citations, audit-trail, rerank, orchestrator, assembly]
requirements: [CITE-01, CITE-02, CITE-03, CITE-04, CITE-05, CITE-06, BOUND-03, BOUND-04, BOUND-05]
dependency_graph:
  requires:
    - plan: "10-01"
      reason: "citation contract must be defined before implementing builder"
  provides:
    - component: "citation builder"
      used_by: ["10-03", "10-04"]
      reason: "builds structured citations from reranked candidates"
    - component: "citation-bearing response matches"
      used_by: ["CLI retrieval", "server routes"]
      reason: "response matches now include full citation metadata"
  affects:
    - component: "retrieval orchestrator"
      change: "now returns merged candidates alongside scored entries for citation building"
    - component: "assembly stage"
      change: "now accepts optional citation map to attach citations to matches"
tech_stack:
  added: []
  patterns:
    - "Citation builder consumes merged candidates, not raw store data"
    - "Pre-rerank and final scores preserved for auditability"
    - "Snippet truncation to 200 characters with ellipsis"
key_files:
  created:
    - path: "packages/server/src/lib/retrieval/citations.ts"
      changes: "citation builder module with buildCitation and buildCitations functions"
    - path: "packages/server/src/lib/retrieval/citations.test.ts"
      changes: "unit tests for citation builder covering all channel combinations"
  modified:
    - path: "packages/server/src/lib/retrieval/types.ts"
      changes: "added preRerankScore and finalScore to MergedCandidate type"
    - path: "packages/server/src/lib/retrieval/merge.ts"
      changes: "updated to preserve pre-rerank and final scores in merged candidates"
    - path: "packages/server/src/lib/retrieval/rerank.ts"
      changes: "updated to preserve pre-rerank score and compute final score"
    - path: "packages/server/src/lib/retrieval/orchestrator.ts"
      changes: "updated dispatchByMode to return merged candidates, build citations before assembly"
    - path: "packages/server/src/lib/retrieval/assembly.ts"
      changes: "updated to accept optional citation map, include summary field in response"
    - path: "packages/server/src/lib/retrieval.test.ts"
      changes: "added citation audit trail tests, updated test for citation presence in responses"
decisions:
  - "Citations are built from merged candidates, not from raw store data"
  - "Semantic mode does not include citations (no rerank stage, simpler scoring)"
  - "Hybrid and graph-assisted modes include full citations with audit trail"
  - "Snippet truncated to 200 characters to prevent large responses"
  - "Citation scores expose both pre-rerank and final scores for full auditability"
  - "Score of 0 is converted to null in citation to indicate channel not used"
metrics:
  duration: "14 minutes"
  completed_date: "2026-04-15"
---

# Phase 10 Plan 02: Citation Builder Implementation Summary

Implement citation builder in server retrieval output stage, consuming reranked candidates and producing contract-shaped citation data.

## One-Liner

Extended MergedCandidate type with audit scores, built citations from reranked candidates, and integrated citation building into the orchestrator output stage.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ----- |
| 1 | Preserve citation audit evidence | 8c63120 | types.ts, merge.ts, rerank.ts, orchestrator.ts, retrieval.test.ts |
| 2 | Create citation builder and integrate | f39387a | citations.ts, citations.test.ts, assembly.ts, orchestrator.ts, retrieval.test.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

No authentication gates encountered. Citation builder only operates on already-filtered candidates from the orchestrator.

## Known Stubs

None - all functionality is properly typed and tested. The summary field in the response schema is populated as null, awaiting the summary builder implementation in a future plan.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: citation_source_trust | packages/server/src/lib/retrieval/citations.ts | Citation builder only receives filtered candidates from orchestrator - verified by test coverage |

## Verification

- Citation builder tests pass: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts` (5 tests) ✓
- Retrieval tests pass: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` (30 tests) ✓
- Route tests pass: `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` (12 tests) ✓
- Citations are populated in hybrid mode responses ✓
- Citations are populated in graph-assisted mode responses ✓
- Pre-rerank and final scores are preserved in citations ✓
- Semantic mode does not include citations (expected behavior) ✓

## Key Files Modified

### packages/server/src/lib/retrieval/citations.ts
- Created citation builder module with `buildCitation` and `buildCitations` functions
- Builds structured citations from `MergedCandidate` objects
- Preserves full audit trail (pre-rerank score, final score, per-channel scores)
- Truncates snippets to 200 characters with ellipsis

### packages/server/src/lib/retrieval/types.ts
- Added `preRerankScore: number` to `MergedCandidate` type
- Added `finalScore: number` to `MergedCandidate` type
- Both fields are required for citation audit trail

### packages/server/src/lib/retrieval/merge.ts
- Updated merge logic to preserve pre-rerank and final scores
- Semantic-only candidates: both scores equal to combined score
- Hybrid candidates: pre-rerank = combined score before rerank, final = after rerank

### packages/server/src/lib/retrieval/rerank.ts
- Updated rerank to preserve pre-rerank score for audit
- Computes final score from combined score + boosts
- Returns updated candidates with both audit fields populated

### packages/server/src/lib/retrieval/orchestrator.ts
- Updated `dispatchByMode` to return `{ scoredEntries, mergedCandidates }`
- Builds citations from merged candidates before assembly
- Passes citations as Map to `assembleResponseBuckets`

### packages/server/src/lib/retrieval/assembly.ts
- Updated `toRetrievalMatch` to accept optional citation parameter
- Updated `assembleResponseBuckets` to accept optional citation map
- Updated `buildRetrievalResponse` and `buildEmptyResponse` to include `summary: null`

## Requirements Satisfied

- **CITE-01**: Every response match includes structured citation with source, snippet, tags
- **CITE-02**: Citations only come from filtered, recalled, reranked safe hits
- **CITE-03**: Citation channels accurately reflect recall channels used
- **CITE-04**: Scores are auditable (pre-rerank and final available)
- **CITE-05**: Citation builder does not read from store, only transforms candidates
- **CITE-06**: Rerank scores are exposed in citation for auditability
- **BOUND-03**: globalConstraints/projectKnowledge buckets unchanged by citation logic
- **BOUND-04**: Citation building is a pure transformation, no side effects
- **BOUND-05**: Citation does not affect retrieval order or filtering

## Success Criteria

- `packages/server/src/lib/retrieval/citations.ts` exists and is called by orchestrator ✓
- Response matches include full citation fields ✓
- Rerank before/after scores are auditable ✓
- `globalConstraints` / `projectKnowledge` continue to represent business scope ✓

## Next Steps

Plan 03 will implement the Summary Builder module that optionally generates LLM-based summaries from retrieved knowledge with citations.

## Self-Check: PASSED

- [x] SUMMARY.md created at .planning/phases/10-回答与引用/10-02-SUMMARY.md
- [x] Task 1 commit exists: 8c63120
- [x] Task 2 commit exists: f39387a
- [x] All expected files modified:
  - packages/server/src/lib/retrieval/types.ts
  - packages/server/src/lib/retrieval/merge.ts
  - packages/server/src/lib/retrieval/rerank.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/assembly.ts
  - packages/server/src/lib/retrieval/citations.ts
  - packages/server/src/lib/retrieval/citations.test.ts
  - packages/server/src/lib/retrieval.test.ts
- [x] Citation builder tests pass (5 tests)
- [x] Retrieval tests pass (30 tests)
- [x] Route tests pass (12 tests)
- [x] Citations are populated in hybrid/graph-assisted responses
- [x] No new threat surfaces introduced
- [x] No stubs that prevent plan goals
