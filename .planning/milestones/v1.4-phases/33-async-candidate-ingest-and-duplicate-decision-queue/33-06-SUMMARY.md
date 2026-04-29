---
phase: 33-async-candidate-ingest-and-duplicate-decision-queue
plan: 06
subsystem: candidate-recovery
tags: [candidates, startup-recovery, server-lifecycle, fastify-hooks]

# Dependency graph
requires:
  - 33-03 (Candidate store with recovery functions)
  - 33-04 (Async processor with processPendingCandidates)
  - 33-05 (Candidate routes for API integration)
provides:
  - Server startup recovery for interrupted candidates
  - Automatic reprocessing of in-flight candidates after restart
  - Proper logging for recovery operations
affects: [server-startup, candidate-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: [fastify-onReady-hook, fire-and-forget-recovery, graceful-restart]

key-files:
  created: []
  modified:
    - packages/server/src/app.ts

key-decisions:
  - "Used Fastify's onReady hook for recovery - runs once when server is ready"
  - "Recovery is fire-and-forget to not block server startup"
  - "Logging includes count of interrupted candidates and processed/error counts"

patterns-established:
  - "onReady hook pattern for server initialization tasks"
  - "Fire-and-forget processing with void operator and .catch() for logging"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 33 Plan 06: Startup Recovery for In-Flight Candidates Summary

**Implemented server startup recovery to reprocess candidates interrupted during processing (server crash, restart, etc.)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-24T11:00:00Z
- **Completed:** 2026-04-24T11:05:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added onReady hook for candidate recovery on server startup
- Imported recovery functions from candidates module
- Implemented recovery flow: find interrupted → reset to received → reprocess
- Added comprehensive logging for recovery operations

## Task Commits

Each task was committed atomically:

1. **Tasks 1-3: Startup recovery implementation** - `1a046a5` (feat)

## Files Modified
- `packages/server/src/app.ts` - Added recovery imports and onReady hook

## Decisions Made
- Used Fastify's `onReady` hook - runs once when server is fully initialized
- Recovery is fire-and-forget to avoid blocking server startup
- Logging includes relevant context (count, processed, errors)
- Error handling wraps entire recovery operation

## Recovery Flow
1. Server becomes ready
2. Snapshot store data
3. Find candidates in 'queued' or 'analyzing' state
4. If found, log count and reset them to 'received'
5. Fire-and-forget processPendingCandidates
6. Log completion with processed/error counts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build errors in server package unrelated to candidates module (Fastify bodyLimit, activation-policy tests, retrieval tests)
- Candidates module and recovery code compile cleanly with no new errors

## Next Phase Readiness
- Server now handles graceful restart scenarios
- Interrupted candidates automatically recovered on startup
- Ready for integration testing with actual candidate submissions

---
*Phase: 33-async-candidate-ingest-and-duplicate-decision-queue*
*Completed: 2026-04-24*
