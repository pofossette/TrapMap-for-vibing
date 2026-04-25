---
phase: 38-graphrag-lite-routing-fallback-and-evaluation-coverage
plan: 02
subsystem: api
tags: [fastify, retrieval, graphrag, fallback, logging]

# Dependency graph
requires:
  - phase: 38-01
    provides: "Graph-plan wrapper contracts and v3 normalization shape"
  - phase: 37
    provides: "compileTrapFirstPlan raw compiler endpoint and trap-first plan primitive"
provides:
  - "searchKnowledgeGraphPlan wrapper service with deterministic confidence/fallback rules"
  - "POST /v3/retrieval/search additive route"
  - "Graph-plan RAG log and route metadata support"
affects: [38-03, retrieval-routes, rag-logging]

# Tech tracking
tech-stack:
  added: []
  patterns: [compiler-first-then-fallback, auditable-routing-trace]

key-files:
  created:
    - packages/server/src/lib/retrieval/graph-plan-search.ts
    - packages/server/src/lib/retrieval/graph-plan-search.test.ts
  modified:
    - packages/server/src/routes/retrieval.ts
    - packages/server/src/routes/retrieval.test.ts
    - packages/server/src/lib/rag-log.ts
    - packages/server/src/lib/retrieval/types.ts
    - packages/server/src/app.ts

key-decisions:
  - "Confidence routing stays deterministic and count-based instead of introducing statistical calibration in Phase 38"
  - "Fallback selection uses v1 graph-assisted for missing skill evidence and v2 capsule retrieval for missing trap evidence"

patterns-established:
  - "Graph-plan wrapper service compiles first, assesses readiness, then executes governed fallback"
  - "Routed GraphRAG-lite requests emit one canonical routingTrace regardless of selected or fallback result"

requirements-completed: [P38-03, P38-04]

# Metrics
duration: 18min
completed: 2026-04-25
---

# Phase 38 Plan 02: Graph-plan Routing Service Summary

**Deterministic GraphRAG-lite wrapper service and additive `/v3/retrieval/search` route with governed fallback and auditable routing traces**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-25T15:45:00Z
- **Completed:** 2026-04-25T16:20:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `searchKnowledgeGraphPlan()` to compile plans, score readiness, and choose governed fallback targets
- Registered `/v3/retrieval/search` without changing the raw `/v3/retrieval/plan` surface
- Extended route tests and graph-plan search tests for selected-plan, v1 fallback, and v2 fallback behavior
- Updated runtime route inventory and RAG log typing for graph-plan traffic

## Task Commits

No new commit recorded in this session. The plan was completed in the current worktree to avoid mixing existing unrelated changes.

## Files Created/Modified
- `packages/server/src/lib/retrieval/graph-plan-search.ts` - Confidence scoring and fallback orchestration
- `packages/server/src/lib/retrieval/graph-plan-search.test.ts` - Deterministic readiness and fallback tests
- `packages/server/src/routes/retrieval.ts` - `/v3/retrieval/search` route wiring
- `packages/server/src/routes/retrieval.test.ts` - Auth/schema/documented-route coverage for v3
- `packages/server/src/lib/rag-log.ts` - Graph-plan mode and routing trace metadata support
- `packages/server/src/lib/retrieval/types.ts` - `plan` channel added to routing types
- `packages/server/src/app.ts` - Documented route inventory includes `/v3/retrieval/search`

## Decisions Made
- Kept readiness scoring deterministic using counts/edges already produced by the compiler
- Preserved the compiler endpoint as a primitive and layered fallback behavior above it in a dedicated service

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The eval runner can now hit a stable routed graph-plan surface instead of only the raw compiler endpoint
- Routing metadata is available for report slicing, cohorting, and fallback audits

---
*Phase: 38-graphrag-lite-routing-fallback-and-evaluation-coverage*
*Completed: 2026-04-25*
