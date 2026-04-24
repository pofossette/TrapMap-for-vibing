---
phase: 33-async-candidate-ingest-and-duplicate-decision-queue
plan: 05
subsystem: api
tags: [candidates, rest-api, routes, async-ingestion, fire-and-forget]

# Dependency graph
requires:
  - 33-01 (CandidateSubmission and DuplicateCase types in contracts)
  - 33-03 (Candidate store CRUD operations)
  - 33-04 (Async processor with fire-and-forget pattern)
provides:
  - REST API endpoints for candidate submission
  - Status checking endpoint for candidates
  - Duplicate case query endpoints for manual review
affects: [candidate-ingestion, duplicate-analysis, review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-api-boundary, fire-and-forget-route-handler, discriminated-union-request]

key-files:
  created:
    - packages/server/src/routes/candidates.ts
  modified:
    - packages/contracts/src/domain/candidates.ts
    - packages/server/src/app.ts

key-decisions:
  - "Skill file uploads use content field in request, converted to sha256/sizeBytes for storage"
  - "Routes follow existing knowledge.ts patterns with auth context resolution"
  - "Fire-and-forget pattern uses void operator for safe route handler integration"

patterns-established:
  - "Request schemas use discriminated union for trap/skill source types"
  - "Response schemas separate submission (minimal) from status (full candidate)"
  - "Ownership check allows self-access, system-admin can access all"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-04-24
---

# Phase 33 Plan 05: Candidate API Routes Summary

**Created REST API routes for async candidate submission with fire-and-forget processing and duplicate case query endpoints for manual review**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-24T10:15:00Z
- **Completed:** 2026-04-24T10:23:00Z
- **Tasks:** 4
- **Files modified:** 2
- **Files created:** 1

## Accomplishments
- Added request/response schemas to contracts with discriminated union for trap/skill submissions
- Created candidate routes with POST for submission and GET for status/duplicate queries
- Integrated fire-and-forget async processing pattern
- Registered routes in app.ts for server startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add candidate response schemas to contracts** - `2a3b203` (feat)
2. **Task 2: Implement candidate routes** - `d4dcc48` (feat)
3. **Task 3: Register candidate routes in app** - `cb9da00` (feat)
4. **Task 4: Verify all routes are accessible** - verification only, no code changes

## Files Created/Modified
- `packages/contracts/src/domain/candidates.ts` - Added request schemas (trap/skill submission) and response schemas for all endpoints
- `packages/server/src/routes/candidates.ts` - New routes file with POST/GET endpoints for candidates and duplicates
- `packages/server/src/app.ts` - Added import and registration for candidateRoutes

## Decisions Made
- Skill file uploads accept `content` field (base64 or text), which is converted to `sha256` and `sizeBytes` for storage
- Request uses discriminated union `z.discriminatedUnion('sourceType', [...])` for type-safe trap/skill handling
- Fire-and-forget pattern integrated directly in route handler with `scheduleCandidateProcessing`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build errors in server package unrelated to candidates module (activation-policy tests, derive.ts, model tests, operations tests)
- Candidates module compiles cleanly with no new errors
- Pre-existing app.ts error with Fastify bodyLimit optional property (not related to candidate routes)

## Next Phase Readiness
- Candidate API routes ready for integration testing
- Async submission returns immediately with candidateId for status polling
- Duplicate case endpoints ready for manual review UI integration

---
*Phase: 33-async-candidate-ingest-and-duplicate-decision-queue*
*Completed: 2026-04-24*
