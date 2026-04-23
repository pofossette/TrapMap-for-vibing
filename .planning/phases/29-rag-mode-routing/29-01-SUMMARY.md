---
phase: 29-rag-mode-routing
plan: 01
subsystem: retrieval
tags: [routing, zod, retrieval-strategy, trace-metadata, evaluation]

# Dependency graph
requires: []
provides:
  - Shared internal routing strategy taxonomy (naive/local/global/hybrid/mix/auto)
  - RoutingTrace schema with selectedMode, routeFamily, routingReason, fallbackApplied, channelsUsed
  - RoutingDecision server type with channel planning and post-recall population
  - selectRetrievalStrategy() and selectRetrievalStrategyV2() deterministic router helpers
  - Routing trace emission in all RAG log entries for both v1 and v2 pipelines
affects: [29-02, 29-03, evaluation-baselines, rag-log-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-family separation: v1 entry vs v2 capsule tracked in RoutingDecision.routeFamily"
    - "Explicit-mode mapping: public v1 modes map to internal strategies via lookup table"
    - "Trace-through-log: routing metadata carried via existing RAG log metadata field"

key-files:
  created:
    - packages/server/src/lib/retrieval/routing.test.ts
  modified:
    - packages/contracts/src/domain/retrieval.ts
    - packages/server/src/lib/retrieval/orchestrator.ts
    - packages/server/src/lib/retrieval/types.ts

key-decisions:
  - "Public v1 mode enum (semantic/hybrid/graph-assisted) maps to internal strategies (local/hybrid/mix) rather than being replaced"
  - "Routing trace carried as additive metadata in existing RAG log entries rather than new telemetry subsystem"
  - "channelsUsed populated after recall execution rather than pre-computed, so it reflects actual channel contribution"

patterns-established:
  - "Strategy selection extracted from inline switch into dedicated router helper producing RoutingDecision"
  - "All RAG log emissions include routingTrace metadata (selectedMode, routeFamily, routingReason, fallbackApplied, channelsUsed)"
  - "v2 routing defaults to capsule-native local strategy with v2-default-capsule reason code"

requirements-completed: [EOPS-03]

# Metrics
duration: 18min
completed: 2026-04-23
---

# Phase 29 Plan 01: Routing Vocabulary Summary

**Shared internal retrieval strategy taxonomy with deterministic router selection and routing trace metadata for evaluation baselines**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-23T13:59:26Z
- **Completed:** 2026-04-23T14:18:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added RetrievalStrategy enum (naive/local/global/hybrid/mix/auto) as internal routing taxonomy in shared contracts
- Added RoutingTrace schema with selectedMode, routeFamily, routingReason, fallbackApplied, and channelsUsed for evaluation baselines
- Extracted router selection from inline dispatchByMode switch into explicit selectRetrievalStrategy/selectRetrievalStrategyV2 helpers
- Wired routing decisions into both v1 and v2 pipelines with trace emission in all RAG log paths (success, empty, error)
- Preserved full backward compatibility with existing v1 z.enum(['semantic', 'hybrid', 'graph-assisted'])

## Task Commits

Each task was committed atomically:

1. **Task 29-01-01: Add canonical routing contracts and trace metadata** - `f4adab5` (feat)
2. **Task 29-01-02: Extract deterministic router selection from inline mode branching** - `e76fbba` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/retrieval.ts` - Added RetrievalStrategy, RouteFamily, RoutingReason enums and RoutingTrace schema
- `packages/server/src/lib/retrieval/types.ts` - Added RoutingChannel union and RoutingDecision interface
- `packages/server/src/lib/retrieval/orchestrator.ts` - Added selectRetrievalStrategy/selectRetrievalStrategyV2, inferChannelsFromMerged, routing trace in all log paths
- `packages/server/src/lib/retrieval/routing.test.ts` - 12 tests covering mode mapping, fallback, determinism, and trace metadata

## Decisions Made
- Public v1 mode names map to internal strategies (semantic->local, hybrid->hybrid, graph-assisted->mix) via lookup table rather than renaming the public enum
- Routing trace is additive metadata in existing RAG log entries, not a separate telemetry subsystem
- channelsUsed is populated after recall execution so it reflects actual channel contribution rather than just planned channels
- Unknown v1 modes fall back to local strategy with fallbackApplied=true

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Routing contracts and trace metadata are available for Phase 29 plans 02 and 03 to consume
- The routingTrace field in RAG log metadata is ready for evaluation baseline extraction in Phase 30/31
- Future auto-routing can extend selectRetrievalStrategy by using parseSeedIntent cues to select from the internal strategy taxonomy

## Self-Check: PASSED

- All 4 created/modified files verified present
- Both task commits verified in git log (f4adab5, e76fbba)
- SUMMARY.md created at expected path
- All 483 server tests pass (471 existing + 12 new routing tests)
- All 201 retrieval-specific tests pass

---
*Phase: 29-rag-mode-routing*
*Completed: 2026-04-23*
