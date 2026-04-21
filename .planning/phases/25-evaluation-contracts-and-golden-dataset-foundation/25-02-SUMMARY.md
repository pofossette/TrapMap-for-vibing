---
phase: 25-evaluation-contracts-and-golden-dataset-foundation
plan: 02
subsystem: testing
tags: [eval, retrieval, datasets, golden, smoke, core, v1, v2, governance]

# Dependency graph
requires:
  - phase: v1.3
    provides: Retrieval endpoints, capsule-first responses, governance filtering
  - phase: 25-01
    provides: Retrieval eval schemas in packages/contracts, root evals/ workspace layout
provides:
  - Smoke and core retrieval datasets for both v1 and v2 endpoints
  - Deterministic scenario fixtures encoding actor context and corpus state
  - Coverage regression tests proving positive, empty, forbidden case matrix
affects: [phase-26, phase-27, phase-28]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scenario/case split for eval fixture reuse"
    - "Separate relevance and governance assertion groups"
    - "Endpoint-specific shape expectations (buckets vs capsules)"

key-files:
  created:
    - evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts
    - evals/retrieval/scenarios/core/retrieval-core-scenarios.ts
    - evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts
    - evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts
    - evals/retrieval/datasets/core/v1-retrieval-core.ts
    - evals/retrieval/datasets/core/v2-retrieval-core.ts
    - evals/retrieval/datasets/retrieval-datasets.test.ts
  modified:
    - evals/retrieval/smoke.ts
    - evals/retrieval/core.ts
    - vitest.config.ts

key-decisions:
  - "Smoke scenarios provide minimal deterministic setup: positive-visible, empty-result, forbidden"
  - "Core scenarios widen coverage: ranked-hits, mixed-visibility, bucket-shape, profile-hints"
  - "v1 cases assert bucketExpectations (globalConstraints/projectKnowledge split)"
  - "v2 cases assert capsule count and profileHint artifact IDs"
  - "Every case has explicit governance expectations even when outcome is positive"

patterns-established:
  - "ScenarioId references link cases to declared fixture state"
  - "Forbidden reasons enum (cross-team, security-level, lifecycle) categorizes governance failures"
  - "Ideal order array supports future Hit@K, MRR, nDCG calculation in Phase 26"

requirements-completed: [REVAL-02]

# Metrics
duration: 20min
completed: 2026-04-21
---

# Phase 25 Plan 02: Golden Dataset Authoring Summary

**Smoke and core retrieval datasets for both v1 and v2 endpoints with deterministic scenario fixtures and coverage regression tests**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-21T08:41:00Z
- **Completed:** 2026-04-21T09:01:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Authored smoke scenarios: positive-visible, empty-result, forbidden with cross-team/security-level/lifecycle reasons
- Authored core scenarios: ranked-hits, mixed-visibility, bucket-shape, profile-hints
- Created v1 smoke datasets: 3 cases (positive, empty, forbidden) with bucket expectations
- Created v2 smoke datasets: 3 cases (positive, empty, forbidden) with capsule/profile-hint expectations
- Created v1 core datasets: 5 cases covering semantic/hybrid/graph-assisted modes and governance
- Created v2 core datasets: 4 cases covering capsule ranking, profile hints, scope distribution
- Added 23 coverage regression tests proving schema validation and coverage matrix
- Wired smoke.ts and core.ts entrypoints to aggregate authored datasets
- Added evals project to vitest.config.ts for test discovery

## Task Commits

Each task was committed atomically:

1. **Task 1: Author deterministic smoke and core scenario fixtures for retrieval evaluation** - `621e50b` (feat)
2. **Task 2: Author the first v1/v2 smoke and core datasets with coverage regression tests** - `fbe88fc` (feat)

## Files Created/Modified
- `evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts` - Positive, empty, forbidden scenarios with actor/corpus fixtures
- `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts` - Ranked-hits, mixed-visibility, bucket-shape, profile-hints scenarios
- `evals/retrieval/datasets/smoke/v1-retrieval-smoke.ts` - 3 v1 smoke cases with bucket expectations
- `evals/retrieval/datasets/smoke/v2-retrieval-smoke.ts` - 3 v2 smoke cases with capsule/profile-hint expectations
- `evals/retrieval/datasets/core/v1-retrieval-core.ts` - 5 v1 core cases with mode variations and governance
- `evals/retrieval/datasets/core/v2-retrieval-core.ts` - 4 v2 core cases with profile hints and governance
- `evals/retrieval/datasets/retrieval-datasets.test.ts` - 23 tests proving coverage matrix
- `evals/retrieval/smoke.ts` - Aggregated smoke-tier export
- `evals/retrieval/core.ts` - Aggregated core-tier export
- `vitest.config.ts` - Added evals project for test discovery

## Decisions Made
- Scenario fixtures encode deterministic actor context (subjectType, activeTeamId, securityLevel, permissions)
- Corpus state encoded in fixtures.knowledgeEntries and fixtures.skillArtifacts
- v1 bucket expectations map bucket names to expected entry IDs
- v2 shape expectations include capsule count and profileHint artifact IDs
- Every case documents forbiddenIds even when empty, ensuring governance is always explicit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree-specific pnpm resolution required `pnpm install` from worktree directory
- Resolved by running `pnpm install` which properly linked node_modules through workspace

## User Setup Required

None - no external service configuration required.

## Verification

All verification commands passed:

```bash
# Dataset regression tests
pnpm exec vitest run --project=evals
# Result: 23 tests passed

# Contract tests
pnpm exec vitest run --project=contracts packages/contracts/src/index.test.ts
# Result: 195 tests passed

# Dry-run smoke tier
pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run
# Result: Loaded 6 cases (v1: 3, v2: 3)
```

## Next Phase Readiness
- Phase 26 runner can import cases from smoke.ts/core.ts
- All cases have schemaVersion: 1 for contract evolution
- Ideal order arrays ready for Hit@K, MRR, nDCG metrics
- Governance expectations ready for leakage detection
- Known v1 route-path instability documented in evals/retrieval/README.md from Plan 25-01

---
*Phase: 25-evaluation-contracts-and-golden-dataset-foundation*
*Completed: 2026-04-21*

## Self-Check: PASSED

All 11 files verified present. Both commits (621e50b, fbe88fc) verified in git log.
