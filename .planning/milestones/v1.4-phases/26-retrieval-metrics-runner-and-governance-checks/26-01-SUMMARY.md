---
phase: 26-retrieval-metrics-runner-and-governance-checks
plan: 01
subsystem: evaluation
tags: [retrieval, evaluation, metrics, governance, testing]

requires:
  - phase: 25-evaluation-contracts-and-golden-dataset-foundation
    provides: Golden retrieval datasets with endpoint-specific cases and separate relevance/governance expectations
provides:
  - Maintainer-facing retrieval evaluation CLI via pnpm scripts
  - Endpoint execution adapters with route-faithful execution
  - Normalized result shape for both v1 and v2 responses
  - Deterministic ranking metrics (Hit@K, MRR, nDCG, Recall@K)
  - Governance assertion layer with forbidden-hit detection
affects: [retrieval-evaluation, ci-reporting, regression-detection]

tech-stack:
  added: []
  patterns:
    - "Adapter pattern for endpoint execution isolation"
    - "Normalizer pattern for v1/v2 response unification"
    - "Binary relevance metrics with zero empty-target policy"
    - "Hard governance assertions separate from ranking metrics"

key-files:
  created:
    - evals/retrieval/lib/types.ts
    - evals/retrieval/lib/metrics.ts
    - evals/retrieval/lib/normalize.ts
    - evals/retrieval/lib/adapters.ts
    - evals/retrieval/lib/governance.ts
    - evals/retrieval/lib/load.ts
    - evals/retrieval/runner.test.ts
  modified:
    - evals/retrieval/run.ts
    - evals/retrieval/README.md
    - package.json

key-decisions:
  - "Use Fastify inject() for route-faithful in-process execution instead of direct library calls"
  - "Binary relevance metrics with 'zero' empty-target policy for reproducibility"
  - "Normalize after execution, not before, to preserve endpoint-specific response details"
  - "Hard governance assertions before aggregate reporting, not soft metric penalties"
  - "Slice keys by {tier, endpoint, mode} for stable aggregation and regression detection"

patterns-established:
  - "Adapter pattern: Execute cases through explicit adapters that record execution path and fallback usage"
  - "Normalizer pattern: Normalize v1 bucketed and v2 capsule-first responses into one shared scored-hit model"
  - "Governance separation: Evaluate forbidden hits, outcome mismatches, and shape violations independently from ranking"

requirements-completed:
  - REVAL-01
  - REVAL-03

duration: 45min
completed: 2026-04-21
---

# Phase 26 Plan 01: Retrieval Metrics Runner Summary

**Executable retrieval evaluation runner with adapter-driven execution, normalized result shapes, deterministic ranking metrics, and hard governance assertions**

## Performance

- **Duration:** 45 min
- **Started:** 2026-04-21T18:30:00Z
- **Completed:** 2026-04-21T19:15:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Maintainers can run retrieval evaluation via root `pnpm` scripts for smoke/core tiers without manual server setup
- v1 and v2 responses normalize into one shared comparable result structure while retaining endpoint-specific diagnostics
- Hit@K, MRR, nDCG, and Recall@K compute deterministically per evaluation slice using binary relevance
- Governance failures surface forbidden hits, unexpected empty/non-empty outcomes, and shape mismatches explicitly

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace dry-run-only retrieval runner with executable adapter-driven flow** - `60c92c1` + `831b5c6` + `69f8ede` + `ab256df` + `a7e3b56` (feat/test)
2. **Task 2: Normalize endpoint responses and compute deterministic ranking metrics per slice** - `831b5c6` + `69f8ede` + `60c92c1` (feat)

**Plan metadata:** To be committed after SUMMARY creation

## Files Created/Modified

- `evals/retrieval/lib/types.ts` - Shared runner result, slice types, and execution metadata interfaces
- `evals/retrieval/lib/metrics.ts` - Ranking metric calculators (Hit@K, MRR, nDCG, Recall@K)
- `evals/retrieval/lib/normalize.ts` - Endpoint-specific response normalization for v1 and v2
- `evals/retrieval/lib/adapters.ts` - Execution context and route adapter with Fastify inject()
- `evals/retrieval/lib/governance.ts` - Governance assertion layer for forbidden-hit and shape checks
- `evals/retrieval/lib/load.ts` - Case loading and validation through shared contracts
- `evals/retrieval/runner.test.ts` - Integration tests for runner execution and governance
- `evals/retrieval/run.ts` - Main runner entrypoint with execution, metrics, and reporting
- `evals/retrieval/README.md` - Updated with runner options and metrics documentation
- `package.json` - Added eval:retrieval scripts for maintainer access

## Decisions Made

- **Fastify inject() for route-faithful execution:** Uses in-process HTTP injection to exercise real route parsing, permission enforcement, and response schema validation without requiring a live daemon
- **Binary relevance with zero empty-target policy:** All metrics return 0 when no relevant IDs exist, providing deterministic behavior for empty-result cases
- **Normalize after execution, not before:** Endpoint-specific response details (buckets for v1, profile hints for v2) are preserved in the normalized result for diagnostics
- **Hard governance assertions:** Forbidden hits and shape mismatches are explicit failures, not soft metric penalties, ensuring governance leaks cannot hide in ranking scores

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing build issues in the server and CLI packages required building contracts package separately and using tsx to run TypeScript directly
- The runner imports directly from source files (packages/contracts/src, packages/server/src) to work with tsx without requiring full project build

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Retrieval evaluation runner is executable from pnpm scripts
- All tests pass (84 tests across 4 test files)
- Ready for Phase 26-02 (governance metrics extension) and Phase 27 (summary evaluation)

---
*Phase: 26-retrieval-metrics-runner-and-governance-checks*
*Completed: 2026-04-21*
