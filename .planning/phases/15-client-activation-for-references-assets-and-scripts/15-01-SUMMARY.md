---
phase: 15-client-activation-for-references-assets-and-scripts
plan: "01"
subsystem: "Retrieval"
tags: ["retrieval", "activation-hints", "v2-api", "capsule-first", "metadata-only", "clientManifest"]
wave: 1
depends_on:
  - 14-04
files_modified:
  - packages/contracts/src/domain/retrieval.ts
  - packages/contracts/src/index.test.ts
  - packages/server/src/lib/retrieval/assembly.ts
  - packages/server/src/lib/retrieval/assembly.test.ts
  - packages/server/src/lib/retrieval/orchestrator.ts
  - packages/server/src/routes/retrieval.ts
autonomous: true
requirements:
  - RETR-05
  - ACTV-01
  - COMP-01
requires:
  - phase: "14-04"
    provides: "v2 retrieval contracts and capsule-first assembly"
provides:
  - "15-01: Activation hint schemas for read-next references, assets, and scripts"
  - "15-01: Pure assembly helpers for metadata-only hint shaping"
  - "15-01: Orchestrator integration sourcing hints from governed clientManifest"
affects: []
tech_stack:
  added: []
  patterns:
    - "Activation hints are metadata-only without file bodies (T-15-01)"
    - "Hints sourced from governed clientManifest, not ad-hoc inference (T-15-02)"
    - "Contract-validated activation hint shapes for CLI/server alignment (T-15-03)"
key_files:
  created: []
  modified:
    - "packages/contracts/src/domain/retrieval.ts:100 lines - Added activation hint schemas"
    - "packages/contracts/src/index.test.ts:200 lines - Added activation hint contract tests"
    - "packages/server/src/lib/retrieval/assembly.ts:130 lines - Added hint building helpers"
    - "packages/server/src/lib/retrieval/assembly.test.ts:300 lines - Added hint shaping tests"
    - "packages/server/src/lib/retrieval/orchestrator.ts:15 lines - Integrated hint building"
    - "packages/server/src/routes/retrieval.ts:10 lines - Use hints-enabled response schema"
key_decisions:
  - "Add activationHints field to retrievalV2ResponseWithHintsSchema for enriched responses"
  - "Reuse clientManifest field shapes for reference/asset/script hints instead of duplicating schemas"
  - "Keep hints metadata-only - never include file bodies or script content (T-15-01)"
  - "Source hints only from governed clientManifest on matched artifacts (T-15-02)"
requirements_completed:
  - RETR-05
  - ACTV-01
  - COMP-01
duration: "15 min"
completed_date: "2026-04-17T13:45:00Z"
---

# Phase 15 Plan 01: Activation Hints in Retrieval Contracts Summary

**Extended v2 retrieval with metadata-only activation hints that tell clients what references to read next, what assets are available, and what scripts can be executed - all sourced from governed clientManifest.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-17T13:30:00Z
- **Completed:** 2026-04-17T13:45:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added readNextReferenceHintSchema, assetAvailabilityHintSchema, scriptProfileHintSchema to contracts
- Added capsuleActivationHintsSchema to aggregate hints per capsule
- Added retrievalV2ResponseWithHintsSchema extending v2 response with activation hints
- Implemented buildReadNextHint, buildAssetHint, buildScriptHint pure helpers in assembly.ts
- Implemented buildActivationHints and buildAllActivationHints for manifest-backed hint selection
- Integrated activation hint building in searchKnowledgeV2 orchestrator
- Updated v2 route to validate responses with retrievalV2ResponseWithHintsSchema
- All hints remain metadata-only (T-15-01) and sourced from governed clientManifest (T-15-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add activation hint schemas to retrieval v2 contracts** - `5ce38cc` (test)
   - Added activation hint schemas to retrieval.ts
   - Added contract tests for activation hint shapes
   - Verified legacy coexistence and metadata-only constraints

2. **Task 2: Shape manifest-backed activation hints in v2 retrieval** - `bddcef9` (feat)
   - Added pure hint building helpers in assembly.ts
   - Integrated hint building in searchKnowledgeV2
   - Updated route to use hints-enabled response schema
   - Added tests for manifest-backed hint selection

## Files Created/Modified

- `packages/contracts/src/domain/retrieval.ts` - Activation hint schemas (RETR-05, ACTV-01)
- `packages/contracts/src/index.test.ts` - Contract tests for activation hints
- `packages/server/src/lib/retrieval/assembly.ts` - Pure hint shaping helpers
- `packages/server/src/lib/retrieval/assembly.test.ts` - Hint shaping tests
- `packages/server/src/lib/retrieval/orchestrator.ts` - Manifest-backed hint integration
- `packages/server/src/routes/retrieval.ts` - v2 route with hints-enabled schema

## Decisions Made

- **Schema design:** Reused clientManifest field shapes for hints to avoid duplication
- **Response schema:** Added retrievalV2ResponseWithHintsSchema as additive extension
- **Hint source:** Hints always come from governed clientManifest, never ad-hoc inference
- **Metadata-only:** All hint types exclude file bodies and script content (T-15-01, T-15-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed planned approach.

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-15-01 | Keep activation hints metadata-only; never include file bodies or script text | ✓ Implemented |
| T-15-02 | Source activation metadata only from governed clientManifest | ✓ Implemented |
| T-15-03 | Validate enriched v2 response through shared schemas | ✓ Implemented |

## Next Phase Readiness

- Activation hints are now available in v2 retrieval responses
- Clients can see read-next references, available assets, and script profiles
- Ready for Phase 15-02 (activation policy model) and 15-03 (CLI activation workflows)

---
*Phase: 15-client-activation-for-references-assets-and-scripts*
*Completed: 2026-04-17*
