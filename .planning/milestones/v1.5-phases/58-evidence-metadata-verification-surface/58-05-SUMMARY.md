---
phase: 58-evidence-metadata-verification-surface
plan: 05
subsystem: api
tags: [evidence, retrieval, filtering, fastify, zod, typescript]

# Dependency graph
requires:
  - phase: 58-evidence-metadata-verification-surface
    plan: 02
    provides: EvidenceMeta, EvidenceHint, evidenceLevelSchema, evidenceSourceTypeSchema from contracts
  - phase: 58-evidence-metadata-verification-surface
    plan: 03
    provides: evidenceMeta field on KnowledgeRecord and SkillArtifactRecord
  - phase: 58-evidence-metadata-verification-surface
    plan: 04
    provides: Review flow integration for capturing evidence metadata
provides:
  - extractEvidenceHint helper for compact evidence extraction
  - Evidence hints in retrieval match responses (v1 and v2)
  - Evidence-based filtering in operations knowledge list endpoint
  - PATCH /v1/knowledge/:id/evidence route for updating evidence metadata
affects: [retrieval-routes, operations-routes, cli-knowledge-commands]

# Tech tracking
tech-stack:
  added: []
  patterns: [compact-hint-extraction, optional-field-inclusion, conditional-filtering]

key-files:
  created:
    - packages/server/src/routes/evidence.ts
  modified:
    - packages/server/src/lib/retrieval/assembly.ts
    - packages/server/src/routes/operations.ts
    - packages/server/src/routes/review.ts
    - packages/server/src/app.ts

key-decisions:
  - "Use compact EvidenceHint in retrieval responses instead of full EvidenceMeta to reduce payload size"
  - "Make evidence field optional in responses for backward compatibility with legacy entries"
  - "Require knowledge:review permission for PATCH evidence endpoint"

patterns-established:
  - "Compact hint extraction: extractEvidenceHint helper returns null for missing evidence"
  - "Conditional field inclusion: ...(evidence ? { evidence } : {}) pattern for optional fields"
  - "Evidence filtering: five filter parameters in knowledge list endpoint"

requirements-completed: [EVIDENCE-02]

# Metrics
duration: 15min
completed: 2026-05-02
---

# Plan 58-05: Retrieval Exposure and Operations Filtering Summary

**Exposed evidence metadata in retrieval responses as compact hints and added evidence-based filtering to the operations admin endpoint.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T15:15:00Z
- **Completed:** 2026-05-02T15:30:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added extractEvidenceHint helper to extract compact evidence metadata from records
- Updated toRetrievalMatch to include evidence hint when entry has evidenceMeta
- Updated buildCapsuleMatch to accept optional artifact parameter for evidence
- Added 5 evidence-based filters to operations knowledge list endpoint
- Created PATCH /v1/knowledge/:id/evidence route for updating evidence metadata

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend retrieval assembly to include evidence hints** - `f760fe6` (feat)
2. **Task 2: Extend operations route for evidence filtering** - `f5d03a6` (feat)
3. **Task 3: Create PATCH /v1/knowledge/:id/evidence route** - `0a04305` (feat)

## Files Created/Modified
- `packages/server/src/lib/retrieval/assembly.ts` - Added extractEvidenceHint helper, updated toRetrievalMatch and buildCapsuleMatch
- `packages/server/src/routes/operations.ts` - Added evidence-based filtering (5 filter parameters)
- `packages/server/src/routes/review.ts` - Fixed exactOptionalPropertyTypes compatibility issue
- `packages/server/src/routes/evidence.ts` - New file: PATCH endpoint for evidence metadata updates
- `packages/server/src/app.ts` - Registered evidenceRoutes

## Decisions Made
- Use compact EvidenceHint (3 fields) in retrieval responses instead of full EvidenceMeta (5 fields) to keep payloads small
- Make evidence field optional in match responses for backward compatibility with legacy entries that have null evidenceMeta
- Require knowledge:review permission for PATCH evidence endpoint (same permission as review decisions)
- Use conditional spread for optional evidence field: `...(evidence ? { evidence } : {})`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed exactOptionalPropertyTypes type error in review.ts**
- **Found during:** Task 1 (build verification)
- **Issue:** Previous plan's review.ts change caused type error with exactOptionalPropertyTypes tsconfig setting
- **Fix:** Changed from spread conditional to explicit conditional call of applyReviewDecision
- **Files modified:** packages/server/src/routes/review.ts
- **Verification:** Build passes
- **Committed in:** f760fe6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type error)
**Impact on plan:** Minimal - fixed pre-existing type issue to enable build. No scope creep.

## Issues Encountered
None - all tasks executed cleanly after fixing the pre-existing type error.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Evidence metadata fully exposed in retrieval responses (v1 and v2)
- Admin filtering by evidence status operational
- PATCH endpoint for evidence updates available
- CLI commands can now display evidence hints in search results

---
*Phase: 58-evidence-metadata-verification-surface*
*Completed: 2026-05-02*
