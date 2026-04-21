---
phase: 25-evaluation-contracts-and-golden-dataset-foundation
plan: 01
subsystem: testing
tags: [eval, retrieval, zod, contracts, dataset, golden]

# Dependency graph
requires:
  - phase: v1.3
    provides: Retrieval endpoints, capsule-first responses, governance filtering
provides:
  - Canonical retrieval eval schemas in packages/contracts
  - Root evals/ workspace layout with thin TypeScript entrypoints
  - Smoke/core tier dataset conventions
  - Endpoint-specific case contracts (/v1/retrieval/search, /v2/retrieval/search)
affects: [phase-26, phase-27, phase-28]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scenario/case split for eval fixture reuse"
    - "Separate relevance and governance assertion groups"
    - "Endpoint-specific shape expectations"

key-files:
  created:
    - packages/contracts/src/domain/evals/retrieval.ts
    - evals/README.md
    - evals/retrieval/README.md
    - evals/retrieval/run.ts
    - evals/retrieval/smoke.ts
    - evals/retrieval/core.ts
  modified:
    - packages/contracts/src/index.ts
    - packages/contracts/src/index.test.ts

key-decisions:
  - "Eval schemas in packages/contracts, datasets in repo-root evals/"
  - "Endpoint enum explicitly lists /v1/retrieval/search and /v2/retrieval/search to prevent adapter drift"
  - "Relevance and governance expectations are separate assertion groups per REVAL-02"
  - "Dry-run mode with --allow-empty supports validation before Plan 25-02 datasets exist"

patterns-established:
  - "Schema version field for future eval contract evolution"
  - "Tier enum (smoke/core) for dataset organization"
  - "Forbidden reason enum (cross-team, security-level, lifecycle) for precise failure categorization"

requirements-completed: [REVAL-01, REVAL-02]

# Metrics
duration: 12min
completed: 2026-04-21
---

# Phase 25 Plan 01: Evaluation Contracts and Golden Dataset Foundation Summary

**Canonical retrieval eval schemas in packages/contracts with root evals/ workspace and thin TypeScript entrypoints supporting dry-run validation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-21T08:21:07Z
- **Completed:** 2026-04-21T08:33:58Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added retrievalEvalScenarioSchema and retrievalEvalCaseSchema with Zod validation
- Defined explicit endpoint enum for /v1/retrieval/search and /v2/retrieval/search
- Separated relevance and governance assertion groups in every eval case
- Created evals/ workspace with tier-aware loader and dry-run support
- Documented v1 route-path compatibility risk in evals/retrieval/README.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Add canonical retrieval eval schemas and exports in contracts** - `5305312` (feat)
2. **Task 2: Create root eval workspace layout and thin retrieval entrypoints** - `4ecf260` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/evals/retrieval.ts` - Zod schemas for eval scenarios, cases, tiers, endpoints
- `packages/contracts/src/index.ts` - Export eval contracts from package surface
- `packages/contracts/src/index.test.ts` - Regression tests for valid/invalid eval contracts
- `evals/README.md` - Workspace layout, phase boundaries, governance guidance
- `evals/retrieval/README.md` - Endpoint conventions, tier matrix, v1 compatibility risk
- `evals/retrieval/run.ts` - Tier/endpoint-aware loader with --dry-run --allow-empty
- `evals/retrieval/smoke.ts` - Smoke-tier dataset placeholder
- `evals/retrieval/core.ts` - Core-tier dataset placeholder

## Decisions Made
- Contracts live in `packages/contracts`, datasets live in repo-root `evals/` to preserve monorepo "contracts are canonical" rule
- Endpoint values are explicit literals to prevent adapter drift between v1 bucketed and v2 capsule-first responses
- Shape expectations are endpoint-specific: v1 has bucketExpectations, v2 has expectedProfileHintArtifactIds
- Dry-run mode validates layout and contract wiring before Plan 25-02 creates real datasets

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all tests pass, dry-run entrypoint works as expected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 25-02 can now author real smoke/core datasets using the defined schemas
- evals/retrieval/run.ts supports --dry-run --allow-empty for incremental development
- Phase 26 runner can import cases from smoke.ts/core.ts and validate against contracts
- Known v1 route-path instability documented for Phase 26 planning consideration

---
*Phase: 25-evaluation-contracts-and-golden-dataset-foundation*
*Completed: 2026-04-21*
