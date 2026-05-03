---
phase: 60-fix-type-duplication-merge-adaptersyncstate-and-knowledgeind
plan: "03"
subsystem: server
tags: [embeddings, langchain, dead-code, refactoring]

requires: []
provides:
  - Simplified embeddings.ts with dead code removed
  - LangChain-free pre-review.ts implementation
affects: []

tech-stack:
  added: []
  patterns: [direct-function-calls, error-guards]

key-files:
  created: []
  modified:
    - packages/server/src/lib/embeddings.ts
    - packages/server/src/lib/pre-review.ts

key-decisions:
  - "Throw explicit error when embeddings provider not initialized instead of silently falling back"

patterns-established:
  - "Direct async function calls instead of RunnableLambda wrappers"
  - "Plain strings instead of Document objects for content handling"

requirements-completed:
  - TECH-DEBT-01

duration: 15min
completed: 2026-05-03
---

# Phase 60-03: Legacy Layer Cleanup Summary

**Removed dead embedding provider code and unnecessary LangChain wrapping from pre-review.ts**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-03T05:00:00Z
- **Completed:** 2026-05-03T05:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed 149 lines of dead code from embeddings.ts (FallbackEmbeddings, OpenAIEmbeddings, getEmbeddingsAdapter)
- Removed 22 lines of unnecessary LangChain wrapping from pre-review.ts
- Added explicit error message when embeddings provider not initialized

## Task Commits

Each task was committed atomically:

1. **Task C1: Remove dead embedding provider code from embeddings.ts** - `4475128` (refactor)
2. **Task D1: Remove LangChain wrapping from pre-review.ts** - `993f137` (refactor)

## Files Created/Modified
- `packages/server/src/lib/embeddings.ts` - Removed dead legacy embedding provider code (FallbackEmbeddings, OpenAIEmbeddings, getEmbeddingsAdapter, EmbeddingsAdapter interface)
- `packages/server/src/lib/pre-review.ts` - Removed LangChain imports and refactored to direct function calls

## Decisions Made
- Throw explicit error when embeddings provider not initialized instead of falling through to dead code path - improves error messages and debugging
- Use plain strings instead of Document objects in pre-review.ts - Document wrapper provided no value

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - both refactorings were straightforward removals of unused code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dead code removed, codebase cleaner
- Both files pass TypeScript checks
- No behavioral changes to runtime

---
*Phase: 60-fix-type-duplication-merge-adaptersyncstate-and-knowledgeind*
*Completed: 2026-05-03*
