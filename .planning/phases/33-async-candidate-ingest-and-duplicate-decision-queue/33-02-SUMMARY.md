---
phase: 33-async-candidate-ingest-and-duplicate-decision-queue
plan: 02
subsystem: duplicate-detection
tags: [candidates, fingerprint, duplicate-detection, similarity, tokenize]

# Dependency graph
requires:
  - 33-01 (CandidateSubmission and DuplicateCase types in contracts)
provides:
  - Fingerprint computation for trap and skill submissions
  - Unified duplicate detector comparing against traps and skills
  - Tokenize and keyword extraction utilities
affects: [candidate-ingestion, duplicate-analysis, review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [fingerprint-computation, jaccard-similarity, duplicate-detection]

key-files:
  created:
    - packages/server/src/lib/candidates/types.ts
    - packages/server/src/lib/candidates/fingerprint.ts
    - packages/server/src/lib/candidates/detector.ts
    - packages/server/src/lib/candidates/index.ts
  modified: []

key-decisions:
  - "Tokenize function matches pre-review.ts pattern for consistency"
  - "Threshold constants (0.72 high, 0.38 medium) match pre-review.ts values"
  - "Only approved entities considered for duplicate comparison"
  - "Detector compares against both traps and skills in single pass"

patterns-established:
  - "Fingerprint uses SHA-256 hash for deterministic computation"
  - "Jaccard-like overlap score for similarity measurement"
  - "Keywords extracted from capitalized terms, quoted phrases, and code identifiers"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-04-24
---

# Phase 33 Plan 02: Fingerprint Computation and Unified Duplicate Detector Summary

**Implemented fingerprint computation and unified duplicate detector comparing candidates against both traps and skills**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-24T09:15:00Z
- **Completed:** 2026-04-24T09:23:00Z
- **Tasks:** 4
- **Files created:** 4

## Accomplishments
- Created candidates module directory structure with types, fingerprint, detector, and index files
- Implemented tokenize function matching pre-review.ts pattern for consistency
- Added extractKeywords function for selective keyword extraction
- Created computeTrapFingerprint and computeSkillFingerprint functions
- Implemented detectDuplicates function comparing against both traps and skills
- Only approved entities considered for duplicate comparison
- Threshold constants match pre-review.ts values (0.72 high, 0.38 medium)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create candidates module directory structure** - `b13a1af` (feat)
2. **Task 2: Implement fingerprint computation** - `ea533e5` (feat)
3. **Task 3: Implement unified duplicate detector** - `3595b31` (feat)
4. **Task 4: Add barrel export and verify build** - `bf68f9c` (feat)

## Files Created
- `packages/server/src/lib/candidates/types.ts` - Internal interfaces for fingerprint and detection
- `packages/server/src/lib/candidates/fingerprint.ts` - Fingerprint computation and text analysis
- `packages/server/src/lib/candidates/detector.ts` - Unified duplicate detector implementation
- `packages/server/src/lib/candidates/index.ts` - Barrel export for module

## Decisions Made
- Tokenize uses same regex pattern (`/[^a-z0-9]+/`) and min length (3) as pre-review.ts
- Threshold constants (HIGH_OVERLAP_THRESHOLD=0.72, MEDIUM_OVERLAP_THRESHOLD=0.38) match pre-review.ts
- Fingerprint uses SHA-256 hash for deterministic computation
- Detector checks `lifecycleState === 'approved'` before comparing entities
- Jaccard-like overlap score formula: shared / union size
- Matches limited to top 10 for storage efficiency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build errors in server package unrelated to candidates module (activation-policy tests, derive.ts, skill-lookup tests)
- Fixed TypeScript safety check for `matches[0]` access in detectDuplicates

## Next Phase Readiness
- Fingerprint computation ready for use in async ingestion boundary
- Duplicate detection compares against both knowledge entries and skill artifacts
- Module exports all necessary functions for candidate processing pipeline

---
*Phase: 33-async-candidate-ingest-and-duplicate-decision-queue*
*Completed: 2026-04-24*
