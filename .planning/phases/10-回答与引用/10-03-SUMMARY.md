---
phase: 10-回答与引用
plan: "03"
subsystem: retrieval-summary
tags: [summary, extractive, optional, citations, orchestrator]
requirements: [SUMM-01, SUMM-02, SUMM-03, SUMM-04, SUMM-05, BOUND-03, BOUND-05]
dependency_graph:
  requires:
    - plan: "10-02"
      reason: "citation builder must be implemented before summary can reference citations"
  provides:
    - component: "summary builder"
      used_by: ["10-04", "CLI retrieval", "server routes"]
      reason: "generates optional extractive summaries with citations"
    - component: "summary output stage"
      used_by: ["retrieval response"]
      reason: "optional summary field populated in retrieval responses"
  affects:
    - component: "retrieval orchestrator"
      change: "now generates summary after citations, before response assembly"
    - component: "retrieval response"
      change: "summary field populated when includeSummary=true and citations available"
tech_stack:
  added: []
  patterns:
    - "Summary builder as pure function (no external dependencies)"
    - "Extractive summary baseline (deterministic, no LLM calls)"
    - "Summary requires citations (hybrid/graph-assisted modes only)"
    - "includeSummary flag gates summary generation (default: false)"
key_files:
  created:
    - path: "packages/server/src/lib/retrieval/summary.ts"
      changes: "summary builder module with buildSummary function"
    - path: "packages/server/src/lib/retrieval/summary.test.ts"
      changes: "unit tests for summary builder covering all edge cases"
  modified:
    - path: "packages/server/src/lib/retrieval/orchestrator.ts"
      changes: "integrated summary builder after citation building, updated pipeline order"
    - path: "packages/server/src/lib/retrieval/assembly.ts"
      changes: "updated buildRetrievalResponse to accept optional summary parameter"
    - path: "packages/server/src/lib/retrieval.test.ts"
      changes: "added 6 integration tests for summary generation"
decisions:
  - "Summary builder is a pure function with no external dependencies (store, recall, graph)"
  - "Summary requires citations - only works with hybrid/graph-assisted modes, not semantic"
  - "includeSummary flag defaults to false - no behavior change for existing clients"
  - "Extractive summary baseline - deterministic, no LLM calls, synthesizes from hit content"
  - "Summary only operates on safe filtered hits and citations from orchestrator"
metrics:
  duration: "8 minutes"
  completed_date: "2026-04-15"
---

# Phase 10 Plan 03: Summary Builder Implementation Summary

Implement optional summary builder in server retrieval output stage, consuming safe hits and citations to generate extractive summaries.

## One-Liner

Implemented pure function summary builder with extractive baseline, integrated into orchestrator after citation building, gated by includeSummary flag (default: false).

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ----- |
| 1 | Implement summary builder with unit tests | c72c2a5 | summary.ts, summary.test.ts |
| 2 | Wire summary gate into orchestrator with integration tests | 479c9a6 | orchestrator.ts, assembly.ts, retrieval.test.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

No authentication gates encountered. Summary builder only operates on already-filtered hits and citations from the orchestrator.

## Known Stubs

None - all functionality is properly implemented and tested. The summary builder is a pure function with no external dependencies. The extractive summary baseline is fully functional and deterministic.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: summary_purity | packages/server/src/lib/retrieval/summary.ts | Summary builder verified as pure function - no imports of store, recall adapters, or graph index (T-10-07 mitigated) |
| threat_flag: summary_gate | packages/server/src/lib/retrieval/orchestrator.ts | Summary generation gated by includeSummary flag, defaults to false (T-10-08 mitigated) |

## Verification

- Summary unit tests pass: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/summary.test.ts` (8 tests) ✓
- Retrieval integration tests pass: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` (36 tests, 6 new) ✓
- Workflow tests pass: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval-workflow.test.ts` (10 tests) ✓
- Route tests pass: `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` (12 tests) ✓
- Full test suite passes: 208 tests ✓
- includeSummary defaults to false (no behavior change) ✓
- Summary only generated when citations available (hybrid/graph-assisted modes) ✓
- Summary only references safe filtered hits ✓

## Key Files Modified

### packages/server/src/lib/retrieval/summary.ts
- Created summary builder module with `buildSummary` function
- Pure function - no external dependencies (store, recall, graph)
- Returns null if includeSummary=false, no hits, or no citations
- Generates extractive summary from hit shortcuts and details
- Validates output against retrievalSummarySchema
- Deterministic behavior (same inputs produce same outputs)

### packages/server/src/lib/retrieval/summary.test.ts
- Created comprehensive unit tests for summary builder:
  - Returns null when summary disabled (includeSummary=false)
  - Returns null when no hits provided
  - Returns null when no citations provided (contract requirement)
  - Generates extractive summary from provided hits
  - Includes citations in summary output
  - Deterministic behavior (no external services)
  - Pure function verification (no store/recall/graph dependencies)
  - Handles single hit correctly

### packages/server/src/lib/retrieval/orchestrator.ts
- Added import for buildSummary function
- Updated pipeline order comment to include summary generation
- Integrated summary builder after citation building
- Summary generation happens before refinement (both optional)
- Summary only generated when includeSummary=true and citations available
- Extracts hits from assembled response buckets for summary builder
- Passes summary to buildRetrievalResponse

### packages/server/src/lib/retrieval/assembly.ts
- Updated buildRetrievalResponse signature to accept optional summary parameter
- Summary parameter defaults to null for backward compatibility
- Summary included in response when provided

### packages/server/src/lib/retrieval.test.ts
- Added 6 integration tests for summary generation:
  - Returns null summary when includeSummary is false (default)
  - Returns null summary when semantic mode (no citations available)
  - Generates summary when includeSummary is true and mode provides citations
  - Summary only includes citations from already-filtered hits
  - Graph-assisted mode generates summary with citations
  - Summary does not introduce unapproved or unauthorized content

## Requirements Satisfied

- **SUMM-01**: Summary is optional output, defaults to disabled
- **SUMM-02**: Summary only generated from already-filtered safe hits
- **SUMM-03**: Summary returns structured citations that support it
- **SUMM-04**: Summary builder does not bypass filter-first boundaries
- **SUMM-05**: Summary builder is pure function with no external dependencies
- **BOUND-03**: globalConstraints/projectKnowledge buckets unchanged by summary logic
- **BOUND-05**: Summary does not affect retrieval order or filtering

## Success Criteria

- `packages/server/src/lib/retrieval/summary.ts` exists and is pure function ✓
- includeSummary defaults to false ✓
- Summary generated when includeSummary=true and citations available ✓
- Summary includes structured text and citations ✓
- Integration tests prove summary does not bypass approval/team/level boundaries ✓

## Next Steps

Plan 04 will implement end-to-end integration testing and CLI consumption of the new summary and citation fields.

## Self-Check: PASSED

- [x] SUMMARY.md created at .planning/phases/10-回答与引用/10-03-SUMMARY.md
- [x] Task 1 commit exists: c72c2a5
- [x] Task 2 commit exists: 479c9a6
- [x] All expected files modified:
  - packages/server/src/lib/retrieval/summary.ts
  - packages/server/src/lib/retrieval/summary.test.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/lib/retrieval/assembly.ts
  - packages/server/src/lib/retrieval.test.ts
- [x] Summary unit tests pass (8 tests)
- [x] Retrieval integration tests pass (36 tests)
- [x] Workflow tests pass (10 tests)
- [x] Route tests pass (12 tests)
- [x] Full test suite passes (208 tests)
- [x] No new threat surfaces introduced
- [x] No stubs that prevent plan goals
- [x] Summary builder is pure function (verified by test coverage)
- [x] includeSummary defaults to false (verified by tests)
- [x] Summary only operates on safe filtered hits (verified by integration tests)
