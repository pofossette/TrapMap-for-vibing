---
phase: 81-orchestrator-decomposition
plan: 01
subsystem: retrieval
tags: [refactoring, orchestrator, modularization, retrieval-pipeline]

# Dependency graph
requires: []
provides:
  - routing.ts with strategy selection and routing trace logic
  - recall-coordinator.ts with all recall dispatch and channel functions
  - refinement.ts with LLM refinement generation logic
  - Slimmed orchestrator.ts as thin coordinator
affects: [81-02, 81-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module extraction from god file: routing, recall-coordination, refinement split from single 1196-line orchestrator"
    - "Import delegation: orchestrator.ts imports from ./routing.js, ./recall-coordinator.js, ./refinement.js"

key-files:
  created:
    - packages/server/src/lib/retrieval/routing.ts
    - packages/server/src/lib/retrieval/recall-coordinator.ts
    - packages/server/src/lib/retrieval/refinement.ts
  modified:
    - packages/server/src/lib/retrieval/orchestrator.ts
    - packages/server/src/lib/retrieval/orchestrator.test.ts
    - packages/server/src/lib/retrieval/routing.test.ts
    - packages/server/src/lib/retrieval/strict-mode-compliance.test.ts
    - packages/server/src/lib/validation/phase70-gap3-orchestrator.test.ts

key-decisions:
  - "Extracted routing (RetrievalDecision, V1_MODE_TO_STRATEGY, selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace) into routing.ts"
  - "Extracted all recall functions (dispatchByMode, semanticRecall, hybridRecall, graphAssistedRecall, etc.) into recall-coordinator.ts"
  - "Extracted refinement generation (isRefinementAvailable, buildRefinementPrompt, generateRefinement) into refinement.ts"
  - "Orchestrator.ts kept as thin coordinator with only searchKnowledge, searchKnowledgeV2, updateEntryEmbeddingCache, and timedStep helper"
  - "Updated test imports across 4 test files to import routing functions from ./routing.js instead of ./orchestrator.js"

patterns-established:
  - "Retrieval module decomposition pattern: routing.ts (pure), recall-coordinator.ts (IO-heavy), refinement.ts (LLM), orchestrator.ts (pipeline coordination)"

metrics:
  duration: 668s
  completed: 2026-05-05
  tasks_completed: 3
  files_created: 3
  files_modified: 5
  lines_extracted: 756
---

# Phase 81 Plan 01: Orchestrator Module Extraction Summary

Decomposed the 1196-line orchestrator.ts god file into three focused modules (routing, recall-coordination, refinement) plus a slimmed coordinator.

## Line Counts

| File | Before | After | Target |
|------|--------|-------|--------|
| orchestrator.ts | 1196 | 461 | ~250 |
| routing.ts | - | 128 | <150 |
| recall-coordinator.ts | - | 386 | <400 |
| refinement.ts | - | 69 | <100 |

## Module Responsibilities

| Module | Exports | Responsibility |
|--------|---------|---------------|
| routing.ts | RetrievalDecision, selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace | Pure strategy selection and routing trace |
| recall-coordinator.ts | dispatchByMode, semanticRecall, hybridRecall, graphAssistedRecall, computeSemanticCandidates, mergeCandidatesWithGraph, inferChannelsFromMerged, getDbSearchConfig, DbSearchConfig, GRAPH_SCORE_BOOST_FACTOR | All recall dispatch and channel functions |
| refinement.ts | isRefinementAvailable, buildRefinementPrompt, generateRefinement | LLM refinement generation |
| orchestrator.ts | searchKnowledge, searchKnowledgeV2, updateEntryEmbeddingCache | Thin pipeline coordinator |

## Backward Compatibility

- `lib/retrieval.ts` facade: **zero changes** -- still re-exports from `./retrieval/orchestrator.js`
- All exported function names preserved
- TypeScript compilation passes with zero errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Deviation] orchestrator.ts at 461 lines exceeds ~250 target**
- **Found during:** Task 3
- **Issue:** The searchKnowledge and searchKnowledgeV2 functions are inherently long due to deep RAG logging, timedStep wrapping, and error handling pipelines. The ~250 target was optimistic.
- **Fix:** Accepted as-is. All extractable logic was moved. Remaining code is pure orchestration pipeline flow.
- **Impact:** orchestrator.ts reduced from 1196 to 461 lines (61% reduction). Combined with the 3 new modules, the decomposition achieved its goal of single-responsibility separation.

**2. [Rule 1 - Bug] Fixed test imports across 4 test files**
- **Found during:** Task 3
- **Issue:** routing.test.ts, orchestrator.test.ts, phase70-gap3-orchestrator.test.ts, and strict-mode-compliance.test.ts all imported routing functions from ./orchestrator.js which no longer exports them.
- **Fix:** Updated all 4 files to import routing functions from ./routing.js. Updated strict-mode-compliance.test.ts to check recall-coordinator.ts for moved code patterns.
- **Files modified:** orchestrator.test.ts, routing.test.ts, phase70-gap3-orchestrator.test.ts, strict-mode-compliance.test.ts

**3. [Rule 1 - Bug] Removed unused imports in slimmed orchestrator.ts**
- **Found during:** Task 3
- **Issue:** After extraction, MergedCandidate and RetrievalDecision type imports were unused.
- **Fix:** Removed unused imports to keep the file clean.

## Self-Check: PASSED

- FOUND: packages/server/src/lib/retrieval/routing.ts
- FOUND: packages/server/src/lib/retrieval/recall-coordinator.ts
- FOUND: packages/server/src/lib/retrieval/refinement.ts
- FOUND: packages/server/src/lib/retrieval/orchestrator.ts
- FOUND: packages/server/src/lib/retrieval.ts
- FOUND: bd73449 feat(81-01): create routing.ts
- FOUND: 3137109 feat(81-01): create recall-coordinator.ts
- FOUND: 7c117be feat(81-01): create refinement.ts, slim orchestrator.ts
- FOUND: cf434d8 docs(81-01): complete SUMMARY.md
