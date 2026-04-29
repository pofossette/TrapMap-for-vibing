---
phase: 35-manual-result-revalidation-and-publish-merge-reconciliation
plan: 01
subsystem: contracts
tags: [typescript, zod, candidates, resolution, lineage]

# Dependency graph
requires:
  - phase: 34
    provides: Manual result intake and duplicate detection infrastructure
provides:
  - Type definitions for manual resolution workflow
  - ResolutionOutcome schema for tracking resolution results
  - EntityLineage schema for provenance tracking
  - ApplyResolutionResponse schema for resolution endpoint
affects: [35-02, 35-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod schema patterns, type-safe contracts]

key-files:
  created: []
  modified:
    - packages/contracts/src/domain/candidates.ts
    - packages/contracts/src/index.ts

key-decisions:
  - "Added 'resolved' status to CandidateStatusSchema for tracking completed manual resolutions"
  - "ResolutionOutcome captures both independent (published) and merged outcomes"
  - "EntityLineage tracks provenance with source-to-target relationships"

patterns-established:
  - "Schema-first type definitions with zod for runtime validation"
  - "Explicit re-exports for public API surface"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-24
---

# Phase 35 Plan 01: Contracts and Types for Resolution Workflow Summary

**Type definitions and schemas for manual result resolution workflow including resolved status, outcome tracking, and entity lineage**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-24T11:17:07Z
- **Completed:** 2026-04-24T11:19:58Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Added 'resolved' status to CandidateStatusSchema for tracking completed manual resolutions
- Created ResolutionOutcomeSchema for capturing resolution decisions and affected entities
- Created EntityLineageSchema for tracking candidate-to-entity provenance relationships
- Added ApplyResolutionResponseSchema for resolution endpoint responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Add `resolved` status to CandidateStatusSchema** - `170be94` (feat)
2. **Task 2: Add resolution outcome types to candidates.ts** - `a416c3b` (feat)
3. **Task 3: Add response schema for resolution endpoint** - `83a5689` (feat)
4. **Task 4: Export new types from contracts index** - `a07fdb7` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/candidates.ts` - Added resolved status, ResolutionOutcomeSchema, EntityLineageSchema, ApplyResolutionResponseSchema
- `packages/contracts/src/index.ts` - Added explicit exports for new types

## Decisions Made
- ResolutionOutcome captures both independent (publishedEntityId) and merged (mergedIntoEntityId) outcomes with nullable fields
- EntityLineage uses discriminated sourceType/targetType for flexible provenance tracking
- Added explicit re-exports in index.ts for discoverability even though wildcard exports exist

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all TypeScript builds passed on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Type definitions ready for Phase 35-02 revalidation logic implementation
- All schemas exported and accessible from @trapmap/contracts
- CandidateStatusSchema extended to support 'resolved' state

---
*Phase: 35-manual-result-revalidation-and-publish-merge-reconciliation*
*Completed: 2026-04-24*
