---
phase: 14-seed-intent-retrieval-and-capsule-ranking
plan: "04"
subsystem: "Route and CLI Integration"
tags: ["retrieval", "cli", "route", "v2-api", "capsule-first", "seed-only"]
wave: 4
depends_on:
  - 14-01
  - 14-03
files_modified:
  - packages/server/src/routes/retrieval.ts
  - packages/server/src/routes/retrieval.test.ts
  - packages/server/src/lib/retrieval.ts
  - packages/cli/src/commands/retrieval.ts
  - packages/cli/src/commands/retrieval.test.ts
autonomous: true
requirements:
  - COMP-01
  - COMP-03
  - RETR-01
must_haves:
  truths:
    - "CLI still accepts a single seed and can consume the capsule-first v2 response."
    - "A compatibility path preserves legacy retrieval during migration instead of forcing an in-place break."
    - "Routes stay thin and contract-driven while server retrieval internals evolve."
  artifacts:
    - path: "packages/server/src/routes/retrieval.ts"
      provides: "Thin legacy/v2 retrieval routing"
    - path: "packages/server/src/lib/retrieval.ts"
      provides: "Compatibility facade exposing stable retrieval entrypoints"
    - path: "packages/cli/src/commands/retrieval.ts"
      provides: "Seed-only CLI formatter for capsule-first output"
    - path: "packages/cli/src/commands/retrieval.test.ts"
      provides: "CLI regression coverage for v2 output and migration coexistence"
requires:
  - phase: "14-01"
    provides: "v2 retrieval schemas with seed-only request"
  - phase: "14-03"
    provides: "Pure capsule-first assembly and summary helpers"
provides:
  - "14-04: Thin v2 retrieval routing with auth/permission enforcement"
  - "14-04: CLI single-seed UX preserved with --v2 flag for capsule-first output"
  - "14-04: Legacy v1 coexistence during v1.2 migration"
affects: []
tech_stack:
  added: []
  patterns:
    - "Thin route layer delegating to orchestrator facade"
    - "CLI --v2 flag for v1/v2 path selection"
    - "Capsule-first text formatting without bundle payloads"
key_files:
  created: []
  modified:
    - "packages/server/src/routes/retrieval.ts:64 lines - Added POST /v2/retrieval/search route"
    - "packages/server/src/routes/retrieval.test.ts:340 lines - Added v2 route and coexistence tests"
    - "packages/server/src/lib/retrieval.ts:15 lines - Exported searchKnowledgeV2 from facade"
    - "packages/cli/src/commands/retrieval.ts:295 lines - Added --v2 flag and capsule formatting"
    - "packages/cli/src/commands/retrieval.test.ts:1308 lines - Added v2 CLI tests"
key_decisions:
  - "Add POST /v2/retrieval/search alongside legacy v1 path for backward compatibility (COMP-03)"
  - "CLI uses --v2 flag to opt into capsule-native retrieval path"
  - "v1-only flags (mode, refinement, summary) ignored when --v2 is set"
  - "Keep routes thin - only parse schemas and delegate to orchestrator"
requirements_completed:
  - COMP-01
  - COMP-03
  - RETR-01
duration: "18 min"
completed_date: "2026-04-16T15:28:00Z"
---

# Phase 14 Plan 04: Route and CLI Integration Summary

**Wired v2 retrieval contract through server route and CLI while preserving legacy retrieval coexistence during migration.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-16T15:10:00Z
- **Completed:** 2026-04-16T15:28:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added POST /v2/retrieval/search route for capsule-native retrieval (COMP-03)
- Preserved legacy POST /v1/retrieval/search for backward compatibility
- Exported searchKnowledgeV2 from retrieval facade for v2 delegation
- Added --v2 flag to CLI for selecting capsule-native path (RETR-01)
- Implemented capsule-first text formatting for v2 responses (RETR-04)
- Preserved single-seed UX: `search [seed] --v2` works identically

## Task Commits

Each task was committed atomically:

1. **Task 1: Add thin compatibility routing for legacy and v2 retrieval** - `c5dce57` (feat)
   - Added POST /v2/retrieval/search route with auth/permission enforcement
   - Preserved legacy v1 path for backward compatibility
   - Exported searchKnowledgeV2 from retrieval facade
   - Added route tests for v2 schema validation and auth enforcement

2. **Task 2: Preserve single-seed CLI UX while rendering capsule-first output** - `6d6ab78` (feat)
   - Added --v2 flag to select capsule-native retrieval path
   - Added capsule-first text formatting for v2 responses
   - Added profile hint formatting for activation metadata
   - JSON mode mirrors full v2 response contract for agent consumption
   - v1-only flags ignored when --v2 is set (T-14-11)

## Files Created/Modified

- `packages/server/src/routes/retrieval.ts` - Added v2 retrieval route with auth enforcement
- `packages/server/src/routes/retrieval.test.ts` - Added v2 route and coexistence tests
- `packages/server/src/lib/retrieval.ts` - Exported searchKnowledgeV2 from facade
- `packages/cli/src/commands/retrieval.ts` - Added --v2 flag and capsule formatting
- `packages/cli/src/commands/retrieval.test.ts` - Added v2 CLI tests

## Decisions Made

- **v2 route path:** Added `/v2/retrieval/search` alongside legacy v1 for migration (COMP-03)
- **CLI flag approach:** --v2 flag opts into capsule-native path, preserving simple seed UX
- **v1 flag handling:** v1-only flags (mode, refinement, summary) ignored when --v2 is set
- **Route thinness:** Routes stay thin - only parse schemas and delegate to orchestrator

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in model.test.ts, indexing adapters, and operations.test.ts are unrelated to this plan. These were present before execution and do not affect retrieval functionality.

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-14-10 | Keep existing auth resolution and knowledge:search permission checks on both legacy and v2 routes | ✓ Implemented |
| T-14-11 | Preserve seed-only UX and shared schema parsing so clients cannot drift from contract | ✓ Implemented |
| T-14-12 | Centralize legacy/v2 delegation in facade so compatibility behavior is auditable | ✓ Implemented |

## Next Phase Readiness

- Phase 14 complete: capsule-native retrieval pipeline is fully integrated
- v1 and v2 paths coexist for smooth migration
- CLI can consume capsule-first output with single-seed input
- Ready for end-to-end testing and documentation

---
*Phase: 14-seed-intent-retrieval-and-capsule-ranking*
*Completed: 2026-04-16*
