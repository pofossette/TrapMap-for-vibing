---
phase: 33-async-candidate-ingest-and-duplicate-decision-queue
plan: 04
subsystem: candidate-processing
tags: [candidates, async-processor, retry-logic, fire-and-forget]

# Dependency graph
requires:
  - 33-02 (Fingerprint computation and duplicate detection)
  - 33-03 (Candidate store CRUD operations)
provides:
  - Async processor orchestrating candidate lifecycle
  - Retry logic with configurable delay
  - Fire-and-forget wrapper for route handlers
  - Recovery scan for interrupted candidates
affects: [candidate-ingestion, duplicate-analysis, review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-processing, retry-with-delay, fire-and-forget, state-machine]

key-files:
  created:
    - packages/server/src/lib/candidates/processor.ts
  modified:
    - packages/server/src/lib/candidates/index.ts

key-decisions:
  - "RETRY_DELAY_MS set to 5000ms matching typical async queue patterns"
  - "DUPLICATE_THRESHOLD set to 0.38 matching pre-review.ts medium threshold"
  - "Profile is null for initial skill submissions - derivation happens after approval"
  - "Fire-and-forget pattern uses void operator for safe route handler integration"

patterns-established:
  - "Status transitions: received -> queued -> analyzing -> duplicate_detected|ready_for_review|error"
  - "Retry logic checks retryCount against MAX_RETRIES before processing"
  - "setTimeout schedules retry after delay without blocking"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-04-24
---

# Phase 33 Plan 04: Async Candidate Processor Summary

**Implemented async processor that orchestrates candidate lifecycle from receipt through duplicate detection with retry logic and error handling**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-24T10:00:00Z
- **Completed:** 2026-04-24T10:10:00Z
- **Tasks:** 3
- **Files created:** 1
- **Files modified:** 1

## Accomplishments
- Created processCandidate function with full lifecycle management
- Implemented status transitions with proper state machine flow
- Added processCandidateWithRetry with automatic retry scheduling
- Implemented processPendingCandidates for startup recovery
- Created scheduleCandidateProcessing fire-and-forget wrapper
- Fixed type imports (DuplicateDetectionInput from types.ts)
- Set profile to null for skill submissions (derivation happens post-approval)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the candidate processor** - `1bb65f3` (feat)
2. **Task 2: Create fire-and-forget wrapper** - `e2e0860` (feat)
3. **Task 3: Update barrel export and verify build** - `14c5e31` (feat)

## Files Created/Modified
- `packages/server/src/lib/candidates/processor.ts` - Async processor with retry logic
- `packages/server/src/lib/candidates/index.ts` - Added processor export to barrel

## Decisions Made
- RETRY_DELAY_MS = 5000ms for reasonable delay between retries
- DUPLICATE_THRESHOLD = 0.38 matches pre-review.ts medium threshold
- Status transitions through queued -> analyzing -> final status
- Skill submissions use null profile since derivation happens after approval
- Fire-and-forget uses void operator with catch handler for logging

## Deviations from Plan

Minor fixes required:
- DuplicateDetectionInput imported from types.ts instead of detector.ts
- Profile set to null for skill submissions (contracts use metadata, not profile)

## Issues Encountered
- Pre-existing TypeScript build errors in server package unrelated to candidates module (activation-policy tests, derive.ts, model tests, retrieval tests)
- Candidates module compiles cleanly with no new errors

## Next Phase Readiness
- Processor ready for integration with submission endpoints
- Fire-and-forget pattern safe for route handlers
- Recovery scan supports server restart scenarios

---
*Phase: 33-async-candidate-ingest-and-duplicate-decision-queue*
*Completed: 2026-04-24*
