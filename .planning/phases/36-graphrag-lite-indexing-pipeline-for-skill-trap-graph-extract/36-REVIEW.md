# Phase 36 Review: GraphRAG-lite Indexing Pipeline for Skill/Trap Graph Extract

**Review Date**: 2026-04-25
**Diff Base**: 21cdab3f1b5feda3a39f6a402917baa297273cfe

## Executive Summary

This phase implements a GraphRAG-lite indexing pipeline that provides durable graph persistence, locked vocabulary for node kinds and relation types, hard-edge cycle validation, and cross-domain reconciliation between trap (knowledge entry) and skill (artifact) sources. The implementation is well-structured with comprehensive test coverage and follows established patterns from the existing codebase.

## Architecture Overview

### Core Components

1. **graph-lite/documents.ts** - Document type definitions and builders
   - `GraphNodeRecord` and `GraphEdgeRecord` types with locked vocabulary
   - `GraphIndexDocumentRecord` for durable persistence
   - `buildTrapGraphDocument` and `buildSkillGraphDocument` builders

2. **graph-lite/store.ts** - Store-backed persistence helpers
   - `upsertGraphIndexDocument` - Idempotent upsert by sourceType+sourceId
   - `removeGraphIndexDocumentsForSource` - Deterministic removal
   - `getGraphIndexDocuments` and `getGraphIndexDocumentsForSource` readers

3. **graph-lite/graphology.ts** - Graph assembly and validation
   - `buildGraphFromDocuments` - Assemble graphology graph from documents
   - `projectHardDependencyGraph` - DAG projection with only hard edges
   - `assertNoHardDependencyCycles` - Cycle detection with deterministic error
   - `buildLocalExpansionView` - Bounded local expansion for recall

4. **adapters/graph.ts** - Trap (knowledge entry) graph adapter
   - Implements `IndexAdapter` interface with sync/remove methods
   - Store-backed persistence with backward-compatible in-memory cache
   - Hard-edge cycle validation before persist

5. **adapters/artifact-graph.ts** - Skill (artifact) graph adapter
   - Reads only derived.profile and derived.capsules (D-01, D-02)
   - Excludes clientManifest.assets and clientManifest.scripts
   - Mirrors trap adapter shape for consistency

6. **adapters/graph-builders.ts** - Pure document builder
   - `buildTrapGraphDocument` assembles candidate from extraction results
   - Pure function - does not persist

7. **skill-events.ts** - Skill graph lifecycle orchestration
   - `extractSkillGraphPrimitives` - Extract nodes/edges from profile/capsules
   - `buildSkillGraphDocument` - Build document from artifact
   - `determineSkillIndexAction` - Map lifecycle transitions
   - `runSkillIndexEvent` - Execute indexing via adapter fan-out

8. **reconcile.ts** - Cross-domain reconciliation
   - Remove stale documents (missing, deactivated, rejected, old revision)
   - Rebuild missing approved documents
   - Validate rebuild candidates for hard cycles
   - Security-sensitive: removals persist even if rebuild fails

9. **events.ts** - Knowledge entry lifecycle indexing
   - `determineKnowledgeIndexAction` - Map lifecycle transitions
   - `runKnowledgeIndexEvent` - Execute indexing with adapter fan-out
   - Graph document removal on deactivation (T-36-13)

10. **graph-extract.ts** - TrapMap-specific entity extraction
    - `extractTrapGraphEntities` - Deterministic extraction with locked vocabulary
    - `extractGraphEntities` - Backward-compatible legacy interface

11. **recall/graph-assisted.ts** - Graph-assisted retrieval
    - Store-backed or legacy in-memory graph source
    - One-hop bounded expansion
    - Authorization-safe candidate generation

### Data Flow

```
Trap (Knowledge Entry):
  Approval → events.runKnowledgeIndexEvent → graphIndexAdapter.sync
    → extractTrapGraphEntities → buildTrapGraphDocument
    → assertNoHardDependencyCycles → upsertGraphIndexDocument

Skill (Artifact):
  Approval → skill-events.runSkillIndexEvent → artifactGraphIndexAdapter.sync
    → buildSkillGraphDocument → extractSkillGraphPrimitives
    → assertNoHardDependencyCycles → upsertGraphIndexDocument

Reconciliation:
  reconcileGraphIndexes →
    Phase 1: Remove stale documents (security-sensitive)
    Phase 2: Build candidates for missing approved sources
    Phase 3: Validate rebuild candidates, reject on cycle
```

## Code Quality Assessment

### Strengths

1. **Locked Vocabulary Enforcement**
   - Node kinds: `trap | skill | cue | tool | environment | prerequisite | mitigation`
   - Relation types: `mitigates | requires | order | risk-blocks | co-occurs-with`
   - All extractors validate against these sets (graph.test.ts, artifact-graph.test.ts)

2. **Deterministic Behavior**
   - Document IDs are computed: `graphdoc_${sourceType}_${sourceId}_r${revision}`
   - Edge IDs computed: `${sourceNodeId}->${targetNodeId}:${relationType}`
   - Cycle error has deterministic text: "hard dependency cycle detected"

3. **Security-Conscious Design**
   - Graph documents only built from approved content
   - Hard-edge cycles rejected before persistence
   - Stale document removal treated as security-sensitive
   - clientManifest.assets/scripts excluded from extraction (D-01, D-02)

4. **Idempotent Operations**
   - `upsertGraphIndexDocument` replaces by sourceType+sourceId
   - `removeGraphIndexDocumentsForSource` safe to call multiple times
   - Adapter sync checks revision and contentHash for skip

5. **Clean Separation of Concerns**
   - Document builders are pure functions
   - Adapters handle persistence and validation
   - Reconciliation handles cross-domain repair
   - Extraction is separate from persistence

### Areas of Note

1. **Backward Compatibility Layer**
   - `graph.ts` maintains in-memory cache alongside store-backed persistence
   - `graph-extract.ts` provides legacy `extractGraphEntities` interface
   - Marked with `@deprecated` JSDoc annotations
   - Appropriate for migration period

2. **Hard/Soft Detection Logic**
   - `skill-events.ts`: `containsHardLanguage` uses phrase matching
   - `graph-extract.ts`: `containsHardTrigger` and `isMandatoryMitigation`
   - Pattern-based detection may have edge cases but is deterministic

3. **Keyword Lists**
   - `TOOL_KEYWORDS` and `ENVIRONMENT_KEYWORDS` in skill-events.ts
   - `toolKeywords` and `envPatterns` in graph-extract.ts
   - Slight duplication between files but acceptable for independence

## Test Coverage Analysis

### Test Files Reviewed

| File | Tests | Coverage Focus |
|------|-------|----------------|
| graph.test.ts | 15+ | Trap adapter, vocabulary enforcement, cycle detection |
| artifact-graph.test.ts | 13 | Skill adapter, derived text only, governance metadata |
| events.test.ts | 8+ | Lifecycle mapping, indexing triggers, graph removal |
| documents.test.ts | 5 | Document builders, store operations |
| graphology.test.ts | 5 | Graph assembly, cycle detection, local expansion |
| reconcile.test.ts | 10+ | Stale removal, rebuild, cross-domain |
| skill-events.test.ts | 15+ | Extraction primitives, document building, lifecycle |

### Test Quality Observations

1. **Good Coverage of Locked Vocabulary**
   - Tests explicitly verify nodes are from allowed kinds
   - Tests verify edges are from allowed relation types
   - Tests verify forbidden old relation types are not emitted

2. **Hard/Soft Edge Strength**
   - Tests verify mandatory language produces hard edges
   - Tests verify optional language produces soft edges
   - Tests verify order and co-occurs-with are always soft

3. **Security Test Cases**
   - Graph documents removed on deactivation
   - Hard-edge cycles rejected before persistence
   - Stale documents removed even if rebuild fails

4. **Idempotency Tests**
   - Double sync with same revision/contentHash skips work
   - Double remove is safe
   - Upsert replaces old document for same source

## Security Considerations

### Addressed

1. **D-01/D-02: Activation-only Exclusion**
   - `artifact-graph.ts` reads only `derived.profile` and `derived.capsules`
   - `skill-events.ts` explicitly excludes `clientManifest` from extraction
   - Source code contains exact strings `latestRevision.derived.profile` and `latestRevision.derived.capsules`

2. **D-05: Order/Co-occurs-with Exclusion from DAG**
   - `graphology.ts`: `projectHardDependencyGraph` only includes `requires` and `risk-blocks`
   - Tests verify `order` and `co-occurs-with` are excluded from hard graph

3. **D-06: Cycle Validation Before Persist**
   - Both adapters call `assertNoHardDependencyCycles` before `upsertGraphIndexDocument`
   - Reconciliation validates before rebuild upsert

4. **T-09-07: Authorization Safety in Recall**
   - `graphAssistedRecall` intersects graph-derived IDs with eligible entries
   - Graph expansion cannot return unauthorized entries

### Recommendations

1. **Consider Adding Index State Tracking for Graph Adapter**
   - Knowledge entries have `indexState.graph` in `KnowledgeIndexStateRecord`
   - Skills do not have equivalent tracking (acceptable but notable)

2. **Document the Migration Path**
   - Backward compatibility layer should have clear sunset timeline
   - Consider adding metrics for legacy path usage

## Potential Issues

1. **Minor: Knowledge Revision Calculation**
   - `reconcile.ts`: `revision: entry.history.length > 0 ? entry.history.length : 1`
   - This differs from `entry.history.length` used elsewhere
   - May cause off-by-one if history is empty but revision should be 1

2. **Minor: Hard Dependency Phrases May Over-detect**
   - Phrase matching may trigger on "must be applied" in non-dependency contexts
   - Acceptable for deterministic behavior but may create false hard edges

3. **Transaction Pattern in runKnowledgeIndexEvent**
   - Event runs adapter sync inside `store.transact`
   - Some adapters may have async operations that could fail mid-transaction
   - Currently safe because adapters operate synchronously on data

## Compliance with Requirements

| Requirement | Status | Evidence |
|-------------|--------|----------|
| T-36-09: Graph text from derived only | ✅ | artifact-graph.ts reads only profile/capsules |
| T-36-10: Governance metadata inheritance | ✅ | teamId, scope, requiredLevel passed to builders |
| T-36-12: Remove on deactivation | ✅ | skill-events.ts handles 'remove' action |
| T-36-13: Stale document removal | ✅ | reconcile.ts removes missing/deactivated/rejected |
| T-36-14: Rebuild missing approved | ✅ | reconcile.ts rebuilds approved without documents |
| T-36-16: Derive allowed source set | ✅ | `computeApprovedSources` in reconcile.ts |
| D-01/D-02: Activation-only exclusion | ✅ | Extractors exclude clientManifest |
| D-05: Order exclusion from DAG | ✅ | `projectHardDependencyGraph` filters |
| D-06: Cycle validation | ✅ | `assertNoHardDependencyCycles` before persist |

## Dependency Analysis

### New Dependencies (package.json)
- `graphology: ^0.26.0` - Graph data structure
- `graphology-dag: ^0.4.1` - DAG utilities (hasCycle)
- `graphology-operators: ^1.6.1` - Graph operations (subgraph)
- `graphology-shortest-path: ^2.1.0` - Path algorithms

All dependencies are well-established graph libraries with active maintenance.

## Conclusion

The Phase 36 implementation is well-designed with:
- Clear separation between trap and skill indexing paths
- Consistent adapter patterns for both source types
- Comprehensive test coverage of vocabulary constraints
- Security-conscious handling of activation-only content
- Proper hard-edge cycle validation

The backward compatibility layer is appropriate for the migration period and clearly deprecated. The reconciliation logic properly handles stale document removal as a security-sensitive operation that persists even when rebuild fails.

**Recommendation**: Approve for merge. Consider the minor revision calculation discrepancy for a follow-up fix if behavior differs from expectations.
