---
phase: 38-graphrag-lite-routing-fallback-and-evaluation-coverage
plan: 01
subsystem: api
tags: [zod, contracts, evals, graphrag, normalization]

# Dependency graph
requires:
  - phase: 37
    provides: "TrapFirstPlan/PlanQuery contracts and raw /v3/retrieval/plan compiler surface"
provides:
  - "graph-plan retrieval contracts and routing trace metadata for additive v3 search"
  - "retrieval eval endpoint support for /v3/retrieval/search"
  - "shared normalization for selected-plan and fallback payloads"
affects: [38-02, 38-03, retrieval-evals]

# Tech tracking
tech-stack:
  added: []
  patterns: [graph-plan-wrapper-contract, route-family-aware-normalization]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/retrieval.ts
    - packages/contracts/src/domain/evals/retrieval.ts
    - evals/retrieval/lib/types.ts
    - evals/retrieval/lib/normalize.ts
    - evals/retrieval/lib/normalize.test.ts

key-decisions:
  - "Kept /v3/retrieval/plan as the raw compiler primitive and introduced a separate graph-plan wrapper response for routed search"
  - "Extended routing traces with plan/fallback confidence metadata so evals and reports use one canonical contract"

patterns-established:
  - "Graph-plan wrapper responses always carry routingTrace plus exactly one of plan or fallback"
  - "Eval normalization derives route family from endpoint and preserves routing metadata across selected and fallback outcomes"

requirements-completed: [P38-01, P38-02]

# Metrics
duration: 15min
completed: 2026-04-25
---

# Phase 38 Plan 01: Graph-plan Contracts and Normalization Summary

**Graph-plan wrapper contracts, v3 eval endpoint support, and shared normalization for selected-plan versus fallback responses**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-25T15:45:00Z
- **Completed:** 2026-04-25T16:20:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added first-class `graph-plan` route-family and routing-reason vocabulary to retrieval contracts
- Defined wrapper query/response schemas for additive `/v3/retrieval/search`
- Extended eval normalization so selected plans and fallback payloads share one normalized runner shape
- Verified contracts typecheck and normalization tests pass

## Task Commits

No new commit recorded in this session. The plan was completed in the current worktree to avoid mixing existing unrelated changes.

## Files Created/Modified
- `packages/contracts/src/domain/retrieval.ts` - Graph-plan query, response, fallback, and routing trace contracts
- `packages/contracts/src/domain/evals/retrieval.ts` - `/v3/retrieval/search` endpoint support in eval contracts
- `evals/retrieval/lib/types.ts` - Route-family derivation extended to v3 graph-plan
- `evals/retrieval/lib/normalize.ts` - Selected/fallback graph-plan response normalization
- `evals/retrieval/lib/normalize.test.ts` - Tests for selected plan, v2 fallback, and v1 fallback shapes

## Decisions Made
- Kept `/v3/retrieval/plan` unchanged and modeled routed GraphRAG-lite as a sibling wrapper response
- Preserved routing metadata in normalized eval results so adapters and reports do not need endpoint-specific branching

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Server runtime consumed stale `@trapmap/contracts` dist output during eval runs; rebuilding the contracts package resolved the mismatch.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server routing can now depend on stable graph-plan contracts and normalized eval shapes
- Eval/report work can distinguish graph-plan traffic from entry/capsule traffic without special-case parsing

---
*Phase: 38-graphrag-lite-routing-fallback-and-evaluation-coverage*
*Completed: 2026-04-25*
