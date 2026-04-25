---
phase: 38-graphrag-lite-routing-fallback-and-evaluation-coverage
plan: 03
subsystem: testing
tags: [evals, vitest, graphrag, fixtures, reporting]

# Dependency graph
requires:
  - phase: 38-01
    provides: "Graph-plan contracts and normalization for /v3/retrieval/search"
  - phase: 38-02
    provides: "Live routed graph-plan endpoint with routingTrace metadata"
provides:
  - "v3 graph-plan smoke/core datasets and fixture scenarios"
  - "eval adapter support for graphIndexDocuments and routingTrace execution metadata"
  - "report/runner support for /v3/retrieval/search slices and routing distributions"
affects: [retrieval-evals, ci-reporting, future graph-plan regressions]

# Tech tracking
tech-stack:
  added: []
  patterns: [scenario-seeded-graph-docs, route-family-aware-reporting]

key-files:
  created:
    - evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts
    - evals/retrieval/datasets/core/v3-graph-plan-core.ts
  modified:
    - evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts
    - evals/retrieval/scenarios/core/retrieval-core-scenarios.ts
    - evals/retrieval/lib/adapters.ts
    - evals/retrieval/lib/report.ts
    - evals/retrieval/lib/report.test.ts
    - evals/retrieval/run.ts
    - evals/retrieval/lib/load.ts
    - evals/retrieval/smoke.ts
    - evals/retrieval/core.ts
    - evals/retrieval/README.md

key-decisions:
  - "Seed graphIndexDocuments through scenarios instead of inventing a parallel graph-only harness"
  - "Report routing distributions skip missing routingReason instead of synthesizing invalid placeholder values"

patterns-established:
  - "v3 eval cases use the same scenario/case contract as v1/v2 while adding graph fixtures"
  - "Adapters derive execution.selectedMode/routingReason/fallbackApplied from normalized routingTrace"

requirements-completed: [P38-05]

# Metrics
duration: 25min
completed: 2026-04-25
---

# Phase 38 Plan 03: Graph-plan Eval Coverage Summary

**Graph-plan smoke/core datasets, graph-fixture seeding, and report/runner wiring for `/v3/retrieval/search` coverage**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-25T16:00:00Z
- **Completed:** 2026-04-25T16:25:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added dedicated smoke and core datasets for graph-plan selection, fallback, and governance-sensitive coverage
- Extended scenario fixtures to seed `graphIndexDocuments` needed by the plan compiler
- Wired adapters, runner endpoint filters, and reports to understand `/v3/retrieval/search`
- Verified smoke and core eval runs complete successfully against the live routed endpoint

## Task Commits

No new commit recorded in this session. The plan was completed in the current worktree to avoid mixing existing unrelated changes.

## Files Created/Modified
- `evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts` - Smoke-tier v3 selected/fallback cases
- `evals/retrieval/datasets/core/v3-graph-plan-core.ts` - Core-tier v3 selected/governance cases
- `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts` - Graph-plan smoke scenarios and graph docs
- `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts` - Graph-plan core scenarios and graph docs
- `evals/retrieval/lib/adapters.ts` - Scenario graph-doc seeding plus routingTrace execution metadata capture
- `evals/retrieval/lib/report.ts` - Safe routing distribution aggregation for v3 reason codes
- `evals/retrieval/lib/report.test.ts` - Graph-plan route-family and routing-distribution tests
- `evals/retrieval/run.ts` - `/v3/retrieval/search` runner filter support
- `evals/retrieval/lib/load.ts` - v3 endpoint filtering
- `evals/retrieval/smoke.ts` - v3 smoke aggregation
- `evals/retrieval/core.ts` - v3 core aggregation
- `evals/retrieval/README.md` - v3 endpoint and dataset documentation

## Decisions Made
- Rebuilt `@trapmap/contracts` before smoke/core eval runs because server startup resolves the published dist bundle, not raw source files
- Kept graph-plan routing metadata in the same canonical report structures used by v1/v2 instead of inventing a second reporting surface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt stale contracts dist before live eval execution**
- **Found during:** Task 2 (live smoke run)
- **Issue:** App startup failed because `@trapmap/contracts` dist did not yet expose symbols that already existed in source
- **Fix:** Ran `pnpm --filter @trapmap/contracts build` before re-running the live eval command
- **Files modified:** `packages/contracts/dist/*` (generated build output, not tracked in source plan files)
- **Verification:** Smoke and core `/v3/retrieval/search` eval commands completed successfully
- **Committed in:** None - worktree only

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required only to unblock runtime packaging for the live eval command. No scope creep.

## Issues Encountered
- Core v3 cases currently exercise governance-clean routed behavior successfully, but they still route through the graph-plan fallback band rather than returning a selected plan. Smoke coverage already verifies selected-plan behavior.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/v3/retrieval/search` is covered by runner datasets, reports, and route-family slices
- Future graph-plan changes can be measured in the same smoke/core CI surface as legacy retrieval

---
*Phase: 38-graphrag-lite-routing-fallback-and-evaluation-coverage*
*Completed: 2026-04-25*
