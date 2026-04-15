---
phase: 10-回答与引用
plan: "04"
subsystem: cli-route-integration
tags: [cli, route, integration, phase-gate, final]
requirements: [SUMM-06, BOUND-01, BOUND-02, BOUND-04, BOUND-05]
dependency_graph:
  requires:
    - plan: "10-01"
      reason: "citation/summary contracts must be defined before CLI consumption"
    - plan: "10-02"
      reason: "citation builder must be implemented before CLI can display citations"
    - plan: "10-03"
      reason: "summary builder must be implemented before CLI can display summaries"
  provides:
    - component: "CLI citation/summary rendering"
      used_by: ["terminal users", "agent workflows"]
      reason: "CLI now renders Phase 10 output fields in human-readable and JSON formats"
    - component: "route thin-layer verification"
      used_by: ["API clients"]
      reason: "route continues as shared-schema boundary with includeSummary support"
  affects:
    - component: "retrieval CLI command"
      change: "added --summary flag, displays citations in text mode, full contract in JSON"
    - component: "retrieval route"
      change: "verified includeSummary flag passes through shared schema, no business logic added"
tech_stack:
  added: []
  patterns:
    - "CLI only consumes contract-defined fields, no server-internal types"
    - "JSON mode preserves full contract shape including citations and summary"
    - "Text mode shows curated citation info (channels, source) and summary"
    - "Route remains thin layer: auth + parse + delegate"
key_files:
  created: []
  modified:
    - path: "packages/cli/src/commands/retrieval.ts"
      changes: "added --summary flag, updated formatters for citations/summary"
    - path: "packages/cli/src/commands/retrieval.test.ts"
      changes: "added tests for citation/summary JSON fidelity and text display"
    - path: "packages/server/src/routes/retrieval.test.ts"
      changes: "added tests for includeSummary flag and route thin-layer verification"
    - path: "packages/server/src/lib/retrieval.test.ts"
      changes: "added includeSummary: false to all query objects for typecheck"
    - path: "packages/server/src/lib/retrieval/citations.test.ts"
      changes: "created createMockEntry helper with full KnowledgeRecord fields"
    - path: "packages/server/src/lib/retrieval/summary.test.ts"
      changes: "fixed optional chaining for citations array access"
    - path: "packages/server/src/lib/retrieval/summary.ts"
      changes: "added non-null assertion for array access after length check"
decisions:
  - "CLI only displays curated citation info (channels, source) in text mode to keep output scannable"
  - "JSON mode preserves full contract shape for programmatic consumption"
  - "--summary flag added to CLI for optional summary generation"
  - "includeSummary defaults to false - no behavior change for existing clients"
  - "Route verified as thin layer - no citation/summary business logic in routes"
metrics:
  duration: "8 minutes"
  completed_date: "2026-04-15"
---

# Phase 10 Plan 04: CLI and Route Integration Summary

Complete CLI and route final wiring for Phase 10, ensuring new citation/summary fields are consumable from terminal and API without breaking business boundaries.

## One-Liner

Added CLI --summary flag, citation/summary rendering in JSON/text modes, verified route as thin shared-schema boundary, executed full phase gate.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ----- |
| 1 | Update CLI to render citations and optional summary | 370f17a | retrieval.ts, retrieval.test.ts |
| 2 | Complete route thin-layer verification and phase gate | 1e58051, e82e195 | retrieval.test.ts, retrieval.test.ts, citations.test.ts, summary.test.ts, summary.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors after Phase 10 contract changes**
- **Found during:** Task 2 - running server typecheck as part of phase gate
- **Issue:** RetrievalQuery type inference from Zod schema made includeSummary required, not optional. Test objects missing includeSummary field caused 50+ typecheck errors.
- **Fix:** Added includeSummary: false to all RetrievalQuery objects in tests using awk script. Fixed duplicate includeSummary properties that script created. Updated test mock responses to include summary: null field.
- **Files modified:** packages/server/src/lib/retrieval.test.ts, packages/cli/src/commands/retrieval.test.ts
- **Commit:** e82e195

**2. [Rule 1 - Bug] Fixed KnowledgeRecord missing required fields in citations.test.ts**
- **Found during:** Task 2 - running server typecheck
- **Issue:** createMockEntry helper was missing required fields (teamId, ownerUserId, latestRevision, history, metadata, etc.) causing 5 typecheck errors.
- **Fix:** Created comprehensive createMockEntry helper with all required KnowledgeRecord fields. Fixed field names (submittedByUserId vs submittedBy, correct metadata structure).
- **Files modified:** packages/server/src/lib/retrieval/citations.test.ts
- **Commit:** e82e195

**3. [Rule 1 - Bug] Fixed optional chaining for array access**
- **Found during:** Task 2 - running server typecheck
- **Issue:** Accessing citations[0] without null check caused TypeScript error about possibly undefined.
- **Fix:** Added optional chaining (citations[0]?.source.entryId) and non-null assertion in summary.ts after length check.
- **Files modified:** packages/server/src/lib/retrieval.test.ts, packages/server/src/lib/retrieval/summary.test.ts, packages/server/src/lib/retrieval/summary.ts
- **Commit:** e82e195

## Auth Gates

No authentication gates encountered. This plan only modifies CLI formatting and route tests - no auth flows touched.

## Known Stubs

None - all functionality is properly implemented and tested. The CLI now fully renders citations and summary in both JSON and text modes. Route tests verify the thin-layer boundary is maintained.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: cli_contract_only | packages/cli/src/commands/retrieval.ts | CLI verified to only consume contract-defined fields - no server-internal types (T-10-10, T-10-11 mitigated) |
| threat_flag: route_thin_layer | packages/server/src/routes/retrieval.ts | Route verified as thin layer - only auth + parse + delegate, no citation/summary business logic (T-10-12 mitigated) |

## Verification

- CLI tests pass: `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` (20 tests, 7 new for Phase 10) ✓
- Route tests pass: `pnpm --filter @skill-shareer/server test -- src/routes/retrieval.test.ts` (15 tests, 3 new for includeSummary) ✓
- Server typecheck passes: `pnpm --filter @skill-shareer/server exec tsc --noEmit` ✓
- Full phase gate passes: contracts (12) + server focused (211) + CLI (20) + typecheck = 243 checks ✓
- JSON mode preserves full contract shape including citations and summary ✓
- Text mode shows curated citation info (channels, source) and summary ✓
- --summary flag added to CLI, defaults to false ✓
- Route remains thin layer - no business logic added ✓

## Key Files Modified

### packages/cli/src/commands/retrieval.ts
- Added --summary flag to enable summary generation
- Updated formatMatch to display citation info (channels, source) in text mode
- Updated formatRetrievalResponse to display summary section in text mode
- CLI only consumes contract-defined fields, no server-internal types
- JSON mode preserves full contract shape including citations and summary

### packages/cli/src/commands/retrieval.test.ts
- Added tests for JSON mode citation/summary output fidelity
- Added tests for text mode citation/summary display
- Added tests for --summary flag support
- Added test verifying CLI doesn't compute citation fields - only displays contract data
- Updated existing tests to include summary: null field

### packages/server/src/routes/retrieval.test.ts
- Added test for includeSummary flag in query schema
- Added test for includeSummary default value (false)
- Added test verifying route remains thin layer (auth + parse + delegate)
- All 15 route tests pass

### packages/server/src/lib/retrieval.test.ts
- Added includeSummary: false to all RetrievalQuery objects for typecheck
- Fixed optional chaining for citations array access

### packages/server/src/lib/retrieval/citations.test.ts
- Created createMockEntry helper with full KnowledgeRecord fields
- All 5 citation tests pass with complete mock data

### packages/server/src/lib/retrieval/summary.test.ts
- Fixed optional chaining for citations array access
- All 8 summary tests pass

### packages/server/src/lib/retrieval/summary.ts
- Added non-null assertion for array access after length check
- Pure function verified - no external dependencies

## Requirements Satisfied

- **SUMM-06**: CLI and API responses include optional summary field when generated
- **BOUND-01**: CLI only consumes shared contracts, not server-internal types
- **BOUND-02**: Route remains thin layer - only auth + permission + contract parse + orchestrator call
- **BOUND-04**: Route outputs validated response shape from orchestrator
- **BOUND-05**: Summary field doesn't affect retrieval order or filtering

## Success Criteria

- CLI supports --summary flag and renders citations/summary ✓
- JSON output parseable by retrievalResponseSchema ✓
- Route remains thin shared-schema boundary ✓
- Phase 10 complete verification command passes ✓

## Self-Check: PASSED

- [x] SUMMARY.md created at .planning/phases/10-回答与引用/10-04-SUMMARY.md
- [x] Task 1 commit exists: 370f17a
- [x] Task 2 commits exist: 1e58051, e82e195
- [x] All expected files modified:
  - packages/cli/src/commands/retrieval.ts
  - packages/cli/src/commands/retrieval.test.ts
  - packages/server/src/routes/retrieval.test.ts
  - packages/server/src/lib/retrieval.test.ts
  - packages/server/src/lib/retrieval/citations.test.ts
  - packages/server/src/lib/retrieval/summary.test.ts
  - packages/server/src/lib/retrieval/summary.ts
- [x] CLI tests pass (20 tests)
- [x] Route tests pass (15 tests)
- [x] Server typecheck passes
- [x] Full phase gate passes (243 checks)
- [x] No new threat surfaces introduced
- [x] No stubs that prevent plan goals
- [x] CLI only consumes contract-defined fields
- [x] Route remains thin layer (verified by tests)
