---
phase: 36-graphrag-lite-indexing-pipeline-for-skill-trap-graph-extract
plan: 01
subsystem: indexing/graph-lite
tags: [graphrag, graphology, graph-indexing, tdd, foundation]
dependency_graph:
  requires: [store.ts, indexing/types.ts]
  provides: [graph-lite/documents, graph-lite/store, graph-lite/graphology]
  affects: [store.ts StoreData]
tech_stack:
  added: [graphology, graphology-dag, graphology-operators, graphology-shortest-path]
  patterns: [tdd-red-green, document-builder, hard-soft-edge-distinction, bounded-expansion]
key_files:
  created:
    - packages/server/src/lib/indexing/graph-lite/documents.ts
    - packages/server/src/lib/indexing/graph-lite/documents.test.ts
    - packages/server/src/lib/indexing/graph-lite/store.ts
    - packages/server/src/lib/indexing/graph-lite/graphology.ts
    - packages/server/src/lib/indexing/graph-lite/graphology.test.ts
  modified:
    - packages/server/src/lib/store.ts
    - packages/server/package.json
    - pnpm-lock.yaml
decisions:
  - GraphIndexDocumentRecord keyed by {sourceType, sourceId, revision} for deterministic upsert
  - Skill builder requires derivedTextHash to enforce no activation-only body indexing
  - Hard-edge projection limited to requires and risk-blocks per GraSP distinction
  - SingleSourceLength used for bounded expansion instead of custom BFS
metrics:
  duration_seconds: 865
  completed: "2026-04-24T15:30:12Z"
  tasks: 2
  files: 8
  tests_added: 12
---

# Phase 36 Plan 01: GraphRAG-lite Document and Graph Utility Foundation Summary

Durable graph document contracts with graphology-based hard-edge cycle validation and bounded local expansion, enabling later plans to assemble bounded graph views from stored documents without re-indexing raw content.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add durable graph document contracts and store persistence | `010d34a` (RED), `078c093` (GREEN) | `documents.ts`, `store.ts`, `store.ts StoreData`, `package.json`, `pnpm-lock.yaml` |
| 2 | Add graphology assembly and hard-edge validation helpers | `9593696` (RED), `505185b` (GREEN) | `graphology.ts` |

## What Was Built

### Graph Document Types and Builders (`documents.ts`)

- `GraphNodeKind`: 7 trap/skill/cue/tool/environment/prerequisite/mitigation kinds
- `GraphRelationType`: 5 locked relation types (mitigates, requires, order, risk-blocks, co-occurs-with)
- `GraphRelationStrength`: hard/soft distinction per GraSP paper
- `GraphIndexDocumentRecord`: full document record with governance metadata (teamId, scope, requiredLevel)
- `buildTrapGraphDocument`: builds trap-sourced documents with deterministic ID and content hash
- `buildSkillGraphDocument`: builds skill-sourced documents requiring `derivedTextHash` to prevent activation-only body indexing

### Store Helpers (`store.ts`)

- `upsertGraphIndexDocument`: replaces previous document for same sourceType+sourceId
- `removeGraphIndexDocumentsForSource`: removes all documents for a source without affecting others
- `getGraphIndexDocuments`: returns all graph documents
- `getGraphIndexDocumentsForSource`: returns documents filtered by sourceType+sourceId

### Store Schema (`store.ts` changes)

- Added `graphIndexDocuments: GraphIndexDocumentRecord[]` to `StoreData` interface
- Added `graphIndexDocuments: []` to `EMPTY_STORE`
- Added import for `GraphIndexDocumentRecord` from graph-lite/documents

### Graphology Helpers (`graphology.ts`)

- `buildGraphFromDocuments`: assembles directed multi-graph from document records with stable node/edge keys
- `projectHardDependencyGraph`: projects only hard requires/risk-blocks edges (excludes order/co-occurs-with)
- `assertNoHardDependencyCycles`: throws `hard dependency cycle detected` when cycles exist
- `buildLocalExpansionView`: bounded subgraph from seed nodes using graphology-shortest-path

### Dependencies Installed

- `graphology@^0.26.0`
- `graphology-dag@^0.4.1`
- `graphology-operators@^1.6.1`
- `graphology-shortest-path@^2.1.0`

## TDD Gate Compliance

| Gate | Task 1 | Task 2 |
|------|--------|--------|
| RED | `010d34a` test(documents+store) | `9593696` test(graphology) |
| GREEN | `078c093` feat(documents+store) | `505185b` feat(graphology) |
| REFACTOR | N/A (clean implementation) | N/A (clean implementation) |

Both tasks followed strict TDD with RED (failing test) committed before GREEN (passing implementation).

## Deviations from Plan

None - plan executed exactly as written.

## Key Links Verified

| Link | From | To | Via | Status |
|------|------|----|-----|--------|
| Store schema | `store.ts` | `StoreData` | `graphIndexDocuments` | Confirmed in acceptance criteria |
| Document records | `store.ts` | `documents.ts` | import `GraphIndexDocumentRecord` | Confirmed in import |
| Graph assembly | `graphology.ts` | `documents.ts` | `GraphIndexDocumentRecord`, `GraphEdgeRecord` | Confirmed in import |

## Threat Model Compliance

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-36-01 | Typed nodes/edges with governance metadata on every document | Implemented: scope, teamId, requiredLevel on GraphIndexDocumentRecord |
| T-36-02 | No activation-only body persistence; skill builder requires derivedTextHash | Implemented: buildSkillGraphDocument enforces derivedTextHash parameter |
| T-36-03 | Hard dependency cycle rejection with deterministic error | Implemented: assertNoHardDependencyCycles throws "hard dependency cycle detected" |
| T-36-04 | Governance inheritance on every document record | Implemented: teamId, scope, requiredLevel carried from source to document |

## Test Results

```
Test Files  34 passed (34)
     Tests  558 passed (558)
  Duration  3.32s
```

12 new tests added (7 for documents+store, 5 for graphology).

## Known Stubs

None. All functions are fully implemented with real behavior.

## Threat Flags

No new security surface beyond what the threat model covers.

## Self-Check: PASSED

All 5 created files verified present. All 4 commit hashes verified in git log.
