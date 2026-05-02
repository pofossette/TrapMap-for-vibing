---
phase: 58-evidence-metadata-verification-surface
plan: 01
subsystem: contracts
tags: [zod, schema, evidence, provenance]

# Dependency graph
requires:
  - phase: contracts-common
    provides: actorRefSchema, isoTimestampSchema from domain/common.ts
provides:
  - evidenceSourceTypeSchema (5 enum values for knowledge provenance)
  - evidenceLevelSchema (4 enum values for verification rigor)
  - evidenceMetaSchema (full provenance metadata object)
  - evidenceHintSchema (compact hint for retrieval responses)
  - Inferred TypeScript types for all schemas
affects: [58-02, 58-03, 58-04, 58-05, 58-06, retrieval, knowledge]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod enum + object schema with inferred types, following decay.ts pattern]

key-files:
  created:
    - packages/contracts/src/domain/evidence.ts
  modified:
    - packages/contracts/src/index.ts

key-decisions:
  - "Source type vocabulary intentionally small (5 values) for v1, expandable later"
  - "EvidenceHint omits sourceRef and verifiedBy for compact retrieval payloads"

patterns-established:
  - "Enum schema + object schema + inferred type export pattern for evidence domain"

requirements-completed: [EVIDENCE-01]

# Metrics
duration: 1min
completed: 2026-05-02
---

# Phase 58 Plan 01: Core Evidence Schema Contracts Summary

**Zod schemas for evidence source types, evidence levels, full metadata, and compact hints -- all exported from @trapmap/contracts**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-02T10:58:07Z
- **Completed:** 2026-05-02T10:59:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created evidence schema module with 4 Zod schemas and 4 inferred TypeScript types
- Wired evidence re-export into contracts package index (alphabetical order)
- Contracts build passes, all 224 existing tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create evidence schema module** - `71f526a` (feat)
2. **Task 2: Export evidence types from contracts index** - `b1f05f3` (feat)

## Files Created/Modified
- `packages/contracts/src/domain/evidence.ts` - Evidence schema definitions (source types, levels, meta, hint)
- `packages/contracts/src/index.ts` - Added re-export of evidence domain module

## Decisions Made
- Source type vocabulary kept to 5 values (internal-experience, incident, doc, code, external-reference) for v1 simplicity
- EvidenceHint schema intentionally omits sourceRef and verifiedBy for compact retrieval payloads

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Evidence schemas available for all downstream plans (58-02 through 58-06)
- Types importable via `import { EvidenceMeta, EvidenceHint } from '@trapmap/contracts'`

---
*Phase: 58-evidence-metadata-verification-surface*
*Completed: 2026-05-02*
