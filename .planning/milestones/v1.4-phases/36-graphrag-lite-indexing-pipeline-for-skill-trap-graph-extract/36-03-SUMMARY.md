---
phase: 36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract
plan: 03
subsystem: indexing
tags: [graphrag, graphology, graph, indexing, lifecycle, skill]

# Dependency graph
requires:
  - phase: 36-01
    provides: Graph document types, store helpers, graphology utilities
provides:
  - Artifact-side adapter fan-out seam for skill indexing
  - Skill graph adapter with sourceType: 'skill' persistence
  - Skill graph source builders from derived profile/capsule text
  - Artifact deactivation route with graph document removal
  - Post-commit skill indexing on review/edit/deactivate transitions
affects: [36-04, 36-05, 37, 38]

# Tech tracking
tech-stack:
  added: []
  patterns: [adapter-fan-out, post-commit-indexing, locked-vocabulary-extraction]

key-files:
  created:
    - packages/server/src/lib/indexing/adapters/artifact-graph.ts
    - packages/server/src/lib/indexing/adapters/artifact-graph.test.ts
    - packages/server/src/lib/indexing/artifact-pipeline.ts
    - packages/server/src/lib/indexing/skill-events.ts
    - packages/server/src/lib/indexing/skill-events.test.ts
  modified:
    - packages/server/src/routes/operations.ts
    - packages/server/src/routes/operations.test.ts
    - packages/contracts/src/domain/operations.ts

key-decisions:
  - "Graph text built only from derived.profile and derived.capsules (excludes clientManifest assets/scripts)"
  - "Locked node vocabulary: skill, cue, tool, environment, prerequisite, mitigation"
  - "Locked relation vocabulary: mitigates, requires, order, risk-blocks, co-occurs-with"
  - "Hard/soft edge strength determined by mandatory language detection"
  - "Hard dependency cycle validation before persistence"
  - "Post-commit indexing pattern for lifecycle transitions"

patterns-established:
  - "Adapter fan-out seam: artifact-pipeline.ts normalizes once and fans to registered adapters"
  - "Post-commit indexing: runSkillIndexEvent called after transaction commits"
  - "Evidence metadata: every edge includes field path and snippet for audit trail"

requirements-completed: [P36-02]

# Metrics
duration: 38min
completed: 2026-04-24
---

# Phase 36-03: Skill Graph Indexing Summary

**Skill-side graph extraction and lifecycle-driven indexing with artifact deactivation route and post-commit graph state synchronization**

## Performance

- **Duration:** 38 min
- **Started:** 2026-04-24T15:37:53Z
- **Completed:** 2026-04-24T16:17:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Artifact graph adapter that builds graph documents from derived profile/capsule text only
- Locked node kind vocabulary (skill, cue, tool, environment, prerequisite, mitigation)
- Locked relation vocabulary with hard/soft strength (mitigates, requires, order, risk-blocks, co-occurs-with)
- Hard dependency cycle detection before persistence
- Post-commit skill indexing on review, edit, and deactivate transitions
- New artifact deactivation route with graph document removal
- Tests proving activation-only content (assets/scripts) excluded from graph persistence

## Task Commits

Each task was committed atomically:

1. **Task 1: Build adapter-based skill graph extraction and persistence** - `fe601fa` (feat)
2. **Task 2: Wire skill approve, edit, deactivate, and reapprove transitions to graph indexing** - `12b76ed` (feat)

## Files Created/Modified
- `packages/server/src/lib/indexing/adapters/artifact-graph.ts` - Skill graph adapter with sync/remove operations
- `packages/server/src/lib/indexing/adapters/artifact-graph.test.ts` - Tests for adapter and extraction
- `packages/server/src/lib/indexing/artifact-pipeline.ts` - Artifact-side adapter fan-out seam
- `packages/server/src/lib/indexing/skill-events.ts` - Graph source builders and lifecycle runner
- `packages/server/src/lib/indexing/skill-events.test.ts` - Tests for extraction and lifecycle mapping
- `packages/server/src/routes/operations.ts` - Added deactivation route and post-commit indexing hooks
- `packages/server/src/routes/operations.test.ts` - Integration tests for deactivation and graph state
- `packages/contracts/src/domain/operations.ts` - Deactivation request/response schemas, audit action

## Decisions Made
- Graph extraction reads only `latestRevision.derived.profile` and `latestRevision.derived.capsules` per D-01/D-02
- Hard evidence detected by mandatory phrasing (`must`, `required`, `depends on`, `blocked`, `before`)
- Adapter fan-out pattern mirrors existing trap indexing but operates on skill artifacts
- Post-commit indexing runs synchronously to ensure graph state consistency in response

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **Test artifact validation errors** - Initial test artifacts had invalid SHA-256 hashes (needed 64 chars) and missing required fields. Fixed by using proper 64-char hashes and complete file/history entries.

2. **toSkillArtifact with fresh snapshot** - Using `freshData` from a new snapshot failed because the JSON store snapshot re-reads the file. Fixed by computing `toSkillArtifact` inside the transaction where data is available.

3. **Missing audit action** - `artifact-deactivated` action was not in the audit event enum. Added to both `auditEventSchema` and `auditQuerySchema`.

4. **Fire-and-forget indexing timing** - Initial fire-and-forget approach caused test failures because graph documents weren't removed before assertion. Changed to await indexing with try-catch for error resilience.

## Next Phase Readiness
- Skill-side graph indexing complete and tested
- Ready for trap-side indexing (if separate) or compilation/query phases
- Graph documents now persist with governance metadata for filtering

---
*Phase: 36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract*
*Completed: 2026-04-24*
