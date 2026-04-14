---
phase: 06-检索架构重构
plan: "03"
subsystem: retrieval-architecture
tags: [retrieval, query-mode, contracts, cli, server]
requirements: [ARCH-06, ARCH-05, BOUND-01, BOUND-02, BOUND-04, BOUND-05]
dependency_graph:
  requires:
    - plan: "06-01"
      reason: "orchestrator module provides dispatch seam for mode handling"
    - plan: "06-02"
      reason: "semantic recall and response assembly modules are the current implementation path"
  provides:
    - component: "query mode contract"
      used_by: ["06-07", "06-09"]
      reason: "hybrid and graph-assisted modes will be implemented in future phases"
  affects:
    - component: "CLI search command"
      change: "added --mode flag with semantic default"
    - component: "server orchestrator"
      change: "added mode-aware dispatch with controlled 501 errors for unimplemented modes"
tech_stack:
  added: []
  patterns:
    - "Zod enum for mode validation"
    - "Switch statement dispatch for mode handling"
    - "Controlled error responses for unimplemented features"
key_files:
  created: []
  modified:
    - path: "packages/contracts/src/domain/retrieval.ts"
      changes: "added retrievalQueryModeSchema and mode field to retrievalQuerySchema"
    - path: "packages/cli/src/commands/retrieval.ts"
      changes: "added --mode flag with semantic default"
    - path: "packages/server/src/lib/retrieval/orchestrator.ts"
      changes: "added dispatchByMode function and semanticRecall extraction"
    - path: "packages/cli/src/commands/retrieval.test.ts"
      changes: "added tests for mode flag with default and explicit values"
    - path: "packages/server/src/routes/retrieval.test.ts"
      changes: "added tests for mode field in request schema"
    - path: "packages/server/src/lib/retrieval.test.ts"
      changes: "added mode field to all query objects for type compatibility"
decisions: []
metrics:
  duration: "6 minutes"
  completed_date: "2026-04-14"
---

# Phase 06 Plan 03: Define Query Mode Interface Summary

Define the shared query mode interface and wire it through contracts, CLI, and server without changing current retrieval output.

## One-Liner

Added shared query mode contract (semantic/hybrid/graph-assisted) with semantic default and mode-aware dispatch in orchestrator, creating stable extension seam for Phase 7 and Phase 9.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ---- | ----- |
| 1 | Add query mode to shared retrieval contracts | 8a4e55b | packages/contracts/src/domain/retrieval.ts |
| 2 | Wire mode through CLI and server dispatch | 20b8d59 | packages/cli/src/commands/retrieval.ts, packages/server/src/lib/retrieval/orchestrator.ts, test files |

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

No authentication gates encountered.

## Known Stubs

None - all functionality is wired and operational. Hybrid and graph-assisted modes return controlled 501 errors with clear messages directing users to semantic mode or future phases.

## Threat Flags

No new threat surfaces introduced. The mode field is a contract-defined enum with Zod validation, and unimplemented modes return controlled errors without executing incomplete logic.

## Verification

- All tests pass (87 tests total: 6 contracts, 11 CLI, 70 server)
- Type checking passes for retrieval-specific files
- Mode field is properly defaulted to 'semantic' in contracts
- CLI sends mode in request body
- Server orchestrator dispatches based on mode
- Unimplemented modes (hybrid, graph-assisted) return 501 with clear error messages
- Existing semantic retrieval behavior is unchanged

## Key Files Modified

### packages/contracts/src/domain/retrieval.ts
- Added `retrievalQueryModeSchema` Zod enum with values: semantic, hybrid, graph-assisted
- Added `mode` field to `retrievalQuerySchema` with default value 'semantic'
- Exported `RetrievalQueryMode` type for use in CLI and server

### packages/cli/src/commands/retrieval.ts
- Added `--mode` flag with default value 'semantic'
- Updated request body to include mode field
- Added tests for default and explicit mode values

### packages/server/src/lib/retrieval/orchestrator.ts
- Extracted `semanticRecall` function from main `searchKnowledge` flow
- Added `dispatchByMode` function with switch statement for mode handling
- Implemented controlled 501 errors for hybrid and graph-assisted modes
- Maintained existing semantic retrieval behavior

### Test Files
- `packages/cli/src/commands/retrieval.test.ts`: Added mode flag tests
- `packages/server/src/routes/retrieval.test.ts`: Added mode field schema tests
- `packages/server/src/lib/retrieval.test.ts`: Added mode field to all query objects

## Requirements Satisfied

- **ARCH-06**: Query mode interface defined in shared contracts
- **ARCH-05**: Existing API return structure remains compatible
- **BOUND-01**: Contracts remain the only schema source of truth
- **BOUND-02**: CLI continues to depend only on shared contracts
- **BOUND-04**: Query mode does not replace or overload scope filtering
- **BOUND-05**: All enhancements obey the approval → permission filtering → retrieval → output order

## Success Criteria

- Shared contracts define semantic, hybrid, and graph-assisted ✓
- CLI continues to depend only on shared contracts and API semantics ✓
- Current semantic retrieval output remains compatible ✓
- Phase 7 and Phase 9 can add new recall channels without reopening the public contract shape ✓

## Next Steps

Phase 7 (混合检索) will implement the hybrid mode by adding keyword recall and result merging.
Phase 9 (图辅助检索) will implement the graph-assisted mode by adding entity extraction and relationship-based recall.

## Self-Check: PASSED

- [x] SUMMARY.md created at .planning/phases/06-检索架构重构/06-03-SUMMARY.md
- [x] Task 1 commit exists: 8a4e55b
- [x] Task 2 commit exists: 20b8d59
- [x] All expected files modified:
  - packages/contracts/src/domain/retrieval.ts
  - packages/cli/src/commands/retrieval.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - Test files updated
- [x] All tests passing (contracts, CLI, server retrieval)
- [x] No new threat surfaces introduced
- [x] No stubs that prevent plan goals
