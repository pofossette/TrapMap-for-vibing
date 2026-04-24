---
phase: 33-async-candidate-ingest-and-duplicate-decision-queue
plan: 01
subsystem: data-model
tags: [candidates, duplicate-detection, async-ingestion, store, types]

# Dependency graph
requires: []
provides:
  - CandidateSubmission and DuplicateCase domain types in @trapmap/contracts
  - CandidateSubmissionRecord and DuplicateCaseRecord in server store
  - New collections for candidateSubmissions and duplicateCases in StoreData
affects: [candidate-ingestion, duplicate-analysis, review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-ingestion-boundary, duplicate-detection-record]

key-files:
  created:
    - packages/contracts/src/domain/candidates.ts
  modified:
    - packages/contracts/src/index.ts
    - packages/server/src/lib/store.ts
    - packages/server/src/lib/artifacts/edit.test.ts

key-decisions:
  - "CandidateSubmission uses union payload (trap/skill) to handle both submission types"
  - "DuplicateCase stores matches array sorted by similarity descending"
  - "Analysis snapshot captured fingerprint and tokens for similarity matching"

patterns-established:
  - "Candidate domain types follow existing contract patterns with zod schemas"
  - "Store record types extend contract types for server-side naming"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-04-24
---

# Phase 33 Plan 01: Candidate Submission Types and Store Integration Summary

**Defined candidate submission and duplicate case domain types with store integration for async ingestion pipeline foundation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-24T08:57:43Z
- **Completed:** 2026-04-24T09:09:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Created comprehensive candidate domain types in contracts package
- Defined CandidateStatus enum with 6 pipeline tracking states
- Created DuplicateMatch and DuplicateCase types for duplicate detection records
- Integrated candidate collections into server store infrastructure
- Extended StoreData with candidateSubmissions and duplicateCases arrays

## Task Commits

Each task was committed atomically:

1. **Task 1: Create candidate domain types** - `8f62b55` (feat)
2. **Task 2: Export candidate types from index** - `9e16fde` (feat)
3. **Task 3: Add candidate store types to server** - `1490ffb` (feat)
4. **Task 4: Fix test mock data** - `cc03418` (fix)

## Files Created/Modified
- `packages/contracts/src/domain/candidates.ts` - Candidate submission and duplicate case domain types with zod schemas
- `packages/contracts/src/index.ts` - Added export for candidates module
- `packages/server/src/lib/store.ts` - Added CandidateSubmissionRecord, DuplicateCaseRecord, and new collections
- `packages/server/src/lib/artifacts/edit.test.ts` - Added missing store fields to mock data

## Decisions Made
- Used union payload (trap/skill optional fields) in CandidatePayloadSchema to handle both source types
- DuplicateCase stores matches array with similarity scores for manual review
- AnalysisSnapshot captures normalized content fingerprint and extracted tokens for similarity matching
- Extended contract types for store records following existing patterns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build errors in server package unrelated to candidate types (activation-policy tests, derive.ts, model tests)
- Contracts package required clean rebuild (tsbuildinfo cache) to generate all dist files properly

## Next Phase Readiness
- Candidate types ready for use in async ingestion boundary (33-02)
- Store infrastructure supports new candidate collections
- Types provide foundation for duplicate detection and manual review workflow

---
*Phase: 33-async-candidate-ingest-and-duplicate-decision-queue*
*Completed: 2026-04-24*
