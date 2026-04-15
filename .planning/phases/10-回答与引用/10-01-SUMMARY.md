---
phase: 10-回答与引用
plan: "01"
subsystem: retrieval-contracts
tags: [contracts, citation, summary, typecheck, baseline]
requirements: [CITE-06, SUMM-06, BOUND-01, BOUND-05]
dependency_graph:
  requires:
    - plan: "09-04"
      reason: "graph-assisted retrieval must be stable before adding citation metadata"
  provides:
    - component: "citation contract"
      used_by: ["10-02", "10-03", "10-04"]
      reason: "structured citation schema for output stage"
    - component: "summary contract"
      used_by: ["10-02", "10-03", "10-04"]
      reason: "optional summary schema for output stage"
  affects:
    - component: "CLI retrieval command"
      change: "will consume new citation/summary fields in future plans"
    - component: "server retrieval response"
      change: "will populate new citation/summary fields in future plans"
tech_stack:
  added: []
  patterns:
    - "Zod schemas for contract validation"
    - "Optional chaining for nullable fields"
    - "Backward compatibility with legacy flags"
key_files:
  created: []
  modified:
    - path: "packages/contracts/src/domain/retrieval.ts"
      changes: "added retrievalCitationSchema, retrievalSummarySchema, includeSummary flag"
    - path: "packages/contracts/src/index.test.ts"
      changes: "added tests for citation and summary contracts"
    - path: "packages/server/src/lib/indexing/adapters/vector.ts"
      changes: "added graph bucket to indexState, exported helper functions"
    - path: "packages/server/src/lib/indexing/adapters/keyword.ts"
      changes: "added graph bucket to indexState, exported helper functions"
    - path: "packages/server/src/lib/retrieval.test.ts"
      changes: "added mode field to all RetrievalQuery objects"
    - path: "packages/server/src/lib/retrieval/recall/graph-assisted.test.ts"
      changes: "fixed type issues with createMockEntry, added optional chaining"
decisions:
  - "Canonical summary contract uses structured object with text+citations, not string"
  - "includeSummary flag defaults to false to avoid changing existing behavior"
  - "includeRefinement flag maintained for backward compatibility but is legacy"
  - "Citation scores expose both pre-rerank and final scores for auditability"
metrics:
  duration: "9 minutes"
  completed_date: "2026-04-15"
---

# Phase 10 Plan 01: Baseline Absorption and Contract Definition Summary

Fix server typecheck baseline and define citation/summary contracts in shared contracts package.

## One-Liner

Established green server typecheck baseline and defined Phase 10 citation/summary contracts with structured metadata, optional summary generation, and backward compatibility.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ----- |
| 1 | Fix server typecheck baseline | a272127 | packages/server/src/lib/indexing/adapters/*.ts, test files |
| 2 | Define citation and summary contracts | 7b0b1cc | packages/contracts/src/domain/retrieval.ts, index.test.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

No authentication gates encountered.

## Known Stubs

None - all functionality is properly typed and tested. The citation and summary fields are optional in the contracts, allowing future plans to implement the actual citation builder and summary builder.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: contract_drift | packages/contracts/src/domain/retrieval.ts | New citation/summary fields must be consistently implemented across server and CLI to avoid behavior divergence |

## Verification

- Server typecheck passes: `pnpm --filter @skill-shareer/server exec tsc --noEmit` ✓
- Contracts tests pass: `pnpm --filter @skill-shareer/contracts test` (12 tests) ✓
- Server retrieval tests pass: 183 tests passing ✓
- Contract typecheck passes: `pnpm --filter @skill-shareer/contracts exec tsc --noEmit` ✓
- includeSummary flag defaults to false (no behavior change) ✓
- Citation schema includes all required audit fields (source, snippet, tags, recallChannels, scores) ✓
- Summary schema is structured with text and citations (not just a string) ✓

## Key Files Modified

### packages/contracts/src/domain/retrieval.ts
- Added `retrievalCitationSchema` with structured citation metadata:
  - source: entryId, scope, shortcut
  - snippet: text excerpt
  - tags: labels from knowledge entry
  - recallChannels: array of semantic/keyword/graph
  - scores: semantic, keyword, graph (nullable), preRerank, final
- Added `retrievalSummarySchema` for optional summaries:
  - text: summary content
  - citations: array of citation objects
- Updated `retrievalQuerySchema` to add `includeSummary` flag (default: false)
- Updated `retrievalMatchSchema` to include optional `citation` field
- Updated `retrievalResponseSchema` to include optional `summary` field
- Maintained backward compatibility with `includeRefinement` flag

### packages/contracts/src/index.test.ts
- Added tests for citation schema with all recall channel types
- Added tests for summary schema with citations
- Added tests for default values (includeSummary = false)
- Added tests for backward compatibility with includeRefinement

### packages/server/src/lib/indexing/adapters/vector.ts
- Added missing `graph` bucket to `indexState` initialization
- Exported `upsertVectorIndex`, `removeVectorIndex`, `getVectorPayload` functions
- Exported `VectorIndexPayload` type
- Fixed null pointer issues

### packages/server/src/lib/indexing/adapters/keyword.ts
- Added missing `graph` bucket to `indexState` initialization
- Exported `upsertKeywordIndex`, `removeKeywordIndex`, `hasIndexedKeywordTokens` functions
- Exported `KeywordIndexPayload` type
- Fixed null pointer issues with proper null checks

### packages/server/src/lib/retrieval.test.ts
- Added `mode: 'semantic'` field to all `RetrievalQuery` objects
- Fixed type compatibility issues

### packages/server/src/lib/retrieval/recall/graph-assisted.test.ts
- Fixed `createMockEntry` to include all required `KnowledgeRecord` properties:
  - `reviewHistory`, `reviewNotes`, `lifecycleHistory`, `embeddingCache`, `createdAt`, `updatedAt`
- Fixed lifecycleState from 'pending' to 'submitted' for type compatibility
- Added optional chaining for safer array access in tests

## Requirements Satisfied

- **CITE-06**: Citation contract includes rerank/final score for auditability
- **SUMM-06**: Updated API contract with optional summary field
- **BOUND-01**: Contracts remain the only schema source of truth
- **BOUND-05**: Summary/citation contracts do not change filtering or retrieval order

## Success Criteria

- Server typecheck baseline is green ✓
- Contracts package defines citation/summary schemas ✓
- Contracts tests cover default values and parse behavior ✓
- globalConstraints/projectKnowledge remain as response buckets ✓
- All existing tests continue to pass ✓

## Next Steps

Plan 02 will implement the Citation Builder module that consumes the internal candidate metadata and produces structured citations matching the contract defined in this plan.

## Self-Check: PASSED

- [x] SUMMARY.md created at .planning/phases/10-回答与引用/10-01-SUMMARY.md
- [x] Task 1 commit exists: a272127
- [x] Task 2 commit exists: 7b0b1cc
- [x] All expected files modified:
  - packages/contracts/src/domain/retrieval.ts
  - packages/contracts/src/index.test.ts
  - packages/server/src/lib/indexing/adapters/vector.ts
  - packages/server/src/lib/indexing/adapters/keyword.ts
  - packages/server/src/lib/retrieval.test.ts
  - packages/server/src/lib/retrieval/recall/graph-assisted.test.ts
- [x] Server typecheck passes
- [x] Contracts tests pass (12 tests)
- [x] Server retrieval tests pass (183 tests)
- [x] No new threat surfaces introduced beyond planned contract changes
- [x] No stubs that prevent plan goals
