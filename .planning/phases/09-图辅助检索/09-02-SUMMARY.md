---
phase: 09-图辅助检索
plan: "02"
title: "Shared entity extraction and graph adapter persistence"
slug: shared-extraction-graph-adapter
subsystem: indexing
tags: [graph, extraction, adapters, typescript]
wave: 2
depends_on: [09-01]
provides:
  - id: "shared-entity-extraction"
    description: "Deterministic extraction module for 6 required graph entity classes"
    interface: "packages/server/src/lib/retrieval/graph-extract.ts"
  - id: "graph-adapter-persistence"
    description: "Graph adapter uses shared extraction and persists lightweight artifacts"
    interface: "packages/server/src/lib/indexing/adapters/graph.ts"
affects:
  - "packages/server/src/lib/indexing/adapters/graph.ts"
  - "packages/server/src/lib/retrieval/graph-extract.ts"
tech_stack:
  added: []
  patterns:
    - "Shared extraction module for indexing and query-time reuse"
    - "TDD workflow with RED/GREEN phases"
    - "Idempotent sync based on revision and contentHash"
    - "Noise word filtering and entity deduplication"
key_files:
  created:
    - "packages/server/src/lib/retrieval/graph-extract.ts"
    - "packages/server/src/lib/retrieval/graph-extract.test.ts"
  modified:
    - "packages/server/src/lib/indexing/adapters/graph.ts"
    - "packages/server/src/lib/indexing/adapters/graph.test.ts"
decisions: []
metrics:
  duration: "10 minutes"
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
  tests_added: 29
  tests_passing: 29
---

# Phase 09 Plan 02: Shared Entity Extraction and Graph Adapter Persistence Summary

Implement the actual lightweight graph payload for each knowledge entry by introducing a shared deterministic entity extractor and storing extracted entities/relations through the graph adapter.

## One-Liner

Implemented shared deterministic entity extraction for 6 required graph classes (service, tool, symptom, root-cause, fix, environment) with lightweight persistence through the graph adapter using TDD methodology.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript null safety issues in entity extraction**
- **Found during:** Task 2 verification
- **Issue:** TypeScript reported that `match[1]` from regex `matchAll()` could be undefined, causing type errors
- **Fix:** Added null checks (`value &&`) before accessing `match[1]` in extractServiceEntities function
- **Files modified:** packages/server/src/lib/retrieval/graph-extract.ts
- **Commit:** 6f1c8b3, d9d0273

**2. [Rule 2 - Auto-add missing critical functionality] Fixed scope enum values in test fixtures**
- **Found during:** Task 1 verification
- **Issue:** Test fixtures used incorrect scope values ('global-constraint', 'project-knowledge') instead of the correct contract values ('global', 'project')
- **Fix:** Updated all test fixtures to use correct scope enum values from the contracts
- **Files modified:** packages/server/src/lib/retrieval/graph-extract.test.ts
- **Commit:** 6f1c8b3

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | graph-extract.ts | Extraction logic remains deterministic and server-internal. No LLM dependencies or external calls. Graph payloads are not exposed through contracts. |
| threat_flag: tampering | graph.ts | Graph adapter sync uses revision/contentHash idempotency to prevent stale or corrupted data from persisting. |

## Known Stubs

None - all extraction logic and persistence are fully implemented with functional behavior.

## Key Implementation Details

### Shared Entity Extraction Module

**File:** `packages/server/src/lib/retrieval/graph-extract.ts`

- **Six entity types extracted:** service, tool, symptom, root-cause, fix, environment
- **Deterministic rule-based extraction:** Uses bounded heuristics on normalized document fields
- **Noise filtering:** Excludes 60+ common noise words (articles, prepositions, generic terms)
- **Entity deduplication:** Uses normalized value (lowercase, hyphenated) as uniqueness key
- **Relation extraction:** Creates simple typed relations based on entity co-occurrence
- **Field-aware extraction:** Uses shortcut, detail, labels, and normalized tokens

**Service entities:** Capitalized package-like phrases from labels and shortcut (e.g., TypeScript, Docker, PostgreSQL)

**Tool entities:** CLI/library/framework names from text (e.g., npm, pnpm, git, docker, vitest)

**Symptom entities:** Error/problem phrases (e.g., error, timeout, crash, undefined, null, leak)

**Root-cause entities:** Causal phrases (e.g., because, caused by, due to, root cause)

**Fix entities:** Remediation phrases (e.g., fix, use, enable, configure, validate)

**Environment entities:** Context markers (e.g., ci, local, production, staging, version patterns like "node 18")

**Relation types:** fixed-by, uses-tool, observed-in, runs-in

### Graph Adapter Integration

**File:** `packages/server/src/lib/indexing/adapters/graph.ts`

- Uses shared `extractGraphEntities()` from graph-extract.ts
- Implements `buildGraphArtifact()` to create persisted state
- Maintains global graph index for cross-entry traversal
- Stores entities and relations keyed by entryId, revision, and contentHash
- Idempotent sync based on revision and contentHash matching
- Removes graph data from global index on entry removal

### Test Coverage

**graph-extract.test.ts (12 tests):**
- Service entity extraction from capitalized phrases
- Tool entity extraction from common keywords
- Symptom entity extraction from error phrases
- Root-cause entity extraction from causal phrases
- Fix entity extraction from remediation phrases
- Environment entity extraction from context markers
- Noise filtering and deduplication
- Determinism and field provenance
- Relation extraction between co-occurring entities

**graph.test.ts (17 tests):**
- Sync persistence keyed by entryId, revision, contentHash
- Idempotency when revision and contentHash match
- Work performed when contentHash or revision changes
- Graceful error handling
- Entity extraction with required types
- Relation extraction with bounded relation types
- Normalized entity values for deduplication
- Global graph index updates
- buildGraphArtifact function
- Remove behavior and idempotency
- Adapter contract compliance

## Self-Check: PASSED

**Files created:**
- FOUND: packages/server/src/lib/retrieval/graph-extract.ts
- FOUND: packages/server/src/lib/retrieval/graph-extract.test.ts

**Tests passing:**
- FOUND: 29 tests passing (12 graph-extract + 17 graph adapter)
- FOUND: All new tests pass successfully

**TypeScript compilation:**
- FOUND: No new type errors in graph-extract.ts or graph.ts
- FOUND: Pre-existing type errors in retrieval.test.ts and indexing/adapters/index.ts are outside the scope of this plan

**Acceptance criteria met:**
- FOUND: test -f packages/server/src/lib/retrieval/graph-extract.test.ts
- FOUND: rg -n "service|tool|symptom|root-cause|fix|environment" packages/server/src/lib/retrieval/graph-extract.test.ts
- FOUND: rg -n "extractGraphEntities" packages/server/src/lib/retrieval/graph-extract.test.ts
- FOUND: test -f packages/server/src/lib/retrieval/graph-extract.ts
- FOUND: rg -n "export function extractGraphEntities|service|tool|symptom|rootCause|environment" packages/server/src/lib/retrieval/graph-extract.ts
- FOUND: rg -n "extractGraphEntities|buildGraphArtifact|entityType|relationType" packages/server/src/lib/indexing/adapters/graph.ts
- FOUND: pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/retrieval/graph-extract.test.ts (all 29 tests pass)

## Commits

- `b8373d8` test(09-02): add failing tests for graph entity extraction
- `6f1c8b3` feat(09-02): implement shared graph entity extraction
- `d9d0273` feat(09-02): persist extracted entities and relations through graph adapter

## Success Criteria

- [x] The six required graph entity classes are extracted deterministically
- [x] The graph adapter persists lightweight entity/relation artifacts for approved entries
- [x] Graph storage remains JSON-store based and revision/content-hash aware
- [x] Shared extraction module is reusable for both indexing and query-time graph recall
