# Phase 53: Boundary Indexing & Graph Integration - Research

**Gathered:** 2026-05-02
**Status:** Research complete
**Requirement:** BOUND-03

---

## Research Question

**"What do I need to know to PLAN this phase well?"**

---

## 1. Success Criteria Analysis

Phase 53 must deliver:

| # | Criterion | Implication |
|---|-----------|-------------|
| 1 | Boundary fields indexed as facets in search index for filtering | Need a facet index structure that supports filtering by context labels, version constraints, platforms, etc. |
| 2 | Standardized boundary values (versions, platforms) stored as graph nodes | Extend `GraphNodeKind` with new kinds for boundary-specific values |
| 3 | Graph edges connect knowledge entries to boundary nodes with relationship types | Extend `GraphRelationType` for boundary relationships |
| 4 | Back-references queryable: find all entries matching a boundary constraint | Need reverse lookup from boundary node to source entries |

---

## 2. Existing Infrastructure

### 2.1 Boundary Schema (Phase 51)

Location: `packages/contracts/src/domain/boundary.ts`

Six-layer structure:

```typescript
interface Boundary {
  context: string[];           // e.g., ["frontend", "production"]
  versions: VersionConstraint[]; // e.g., [{package: "react", range: ">=16.8.0"}]
  prerequisites: BoundaryCondition[];
  signals: SignalMatcher[];
  exclusions: ExclusionRule[];
  evidence: EvidenceReference[];
}
```

Key subtypes:
- `VersionConstraint`: `{package, range, note?}`
- `BoundaryCondition`: `{description, kind?, required?}`
- `SignalMatcher`: `{pattern, kind, description?}`
- `ExclusionRule`: `{description, kind?}`
- `EvidenceReference`: `{kind, identifier, url?, note?}`

### 2.2 Data Storage

`KnowledgeRecord` in `packages/server/src/lib/store.ts`:
```typescript
interface KnowledgeRecord {
  // ... other fields
  boundary: Boundary | null;  // Added in Phase 52
}
```

### 2.3 Graph Infrastructure (Phase 36-43)

**Node kinds** (`GraphNodeKind` in `documents.ts`):
```typescript
type GraphNodeKind =
  | 'trap' | 'skill' | 'cue' | 'tool'
  | 'environment' | 'prerequisite' | 'mitigation';
```

**Relation types** (`GraphRelationType`):
```typescript
type GraphRelationType =
  | 'mitigates' | 'requires' | 'order'
  | 'risk-blocks' | 'co-occurs-with';
```

**Graph document record**:
```typescript
interface GraphIndexDocumentRecord {
  sourceType: 'trap' | 'skill';
  sourceId: string;
  revision: number;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  // ... governance fields
}
```

**Graph extraction** (`graph-extract.ts`):
- `extractTrapGraphEntities()` extracts nodes/edges from content
- Already extracts `environment` and `prerequisite` nodes from text
- Uses pattern matching for tools, environments, cues

**Graph storage** (`graph-lite/store.ts`):
- `upsertGraphIndexDocument()` for persistence
- `getGraphIndexDocuments()` for retrieval
- Stored in `StoreData.graphIndexDocuments`

### 2.4 Indexing Pipeline

**Normalizer** (`normalize.ts`):
- `normalizeKnowledgeIndexDocument()` produces `NormalizedIndexDocument`
- Currently extracts: entryId, canonicalText, tokens, contentHash, labels
- **Does NOT include boundary data** - needs extension

**Pipeline** (`pipeline.ts`):
- `syncKnowledgeIndex()` fans out to all adapters
- Three adapters: vector, keyword, graph
- Each adapter implements `IndexAdapter` interface

**Keyword adapter** (`adapters/keyword.ts`):
- Persists tokens and field-specific tokens
- Returns `PersistedKeywordState` with `tokens` and `fieldTokens`
- No facet support currently

### 2.5 Retrieval Filters

**Filter module** (`retrieval/filters.ts`):
- `isEntryEligible()` checks approval, team, security level, decay state
- `filterEligibleEntries()` applies filters to entry list
- Uses `extractGovernanceContext()` and `isGovernanceEligible()`

**No boundary filtering exists yet** - Phase 54 concern, but Phase 53 must prepare data.

---

## 3. Key Design Questions for Planning

### 3.1 Graph Node Extension

**Question:** How should boundary values become graph nodes?

**Options:**

| Option | Description | Trade-offs |
|--------|-------------|------------|
| A. Extend `GraphNodeKind` | Add `boundary-context`, `boundary-version`, `boundary-platform`, etc. | Clean integration with existing graph; requires vocabulary lock |
| B. Generic `boundary-value` kind | Single kind with `label` and `attributes` for type | Flexible but loses type safety in graph queries |
| C. Parallel boundary graph | Separate `BoundaryGraphRecord` structure | Isolated but duplicates infrastructure |

**Recommendation:** Option A aligns with existing design (locked vocabularies for node kinds).

**Proposed new node kinds:**
```typescript
type GraphNodeKind =
  | 'trap' | 'skill' | 'cue' | 'tool'
  | 'environment' | 'prerequisite' | 'mitigation'
  | 'boundary-context'    // NEW: context labels like "frontend", "production"
  | 'boundary-version'    // NEW: version constraints like "react>=16.8.0"
  | 'boundary-platform';  // NEW: platform identifiers like "linux", "docker"
```

### 3.2 Relation Types for Boundaries

**Question:** What relationships connect entries to boundary nodes?

**Options:**

| Relation | From | To | Semantics |
|----------|------|-----|-----------|
| `applies-in` | trap | boundary-context | Entry is applicable in this context |
| `requires-version` | trap | boundary-version | Entry requires this version constraint |
| `excludes-context` | trap | boundary-context | Entry is NOT applicable in this context |
| `excludes-version` | trap | boundary-version | Entry is NOT compatible with this version |

**Edge strength considerations:**
- `applies-in` / `requires-version`: `hard` (required for applicability)
- `excludes-*`: `hard` (strongly excludes)
- Signals could be `soft` (optional relevance hints)

### 3.3 Facet Index Design

**Question:** How should facets be indexed for filtering?

**Options:**

| Option | Description | Trade-offs |
|--------|-------------|------------|
| A. Extend keyword adapter | Add `boundaryFacets` to `PersistedKeywordState` | Reuses existing infrastructure; facets co-located with tokens |
| B. New boundary adapter | Separate `BoundaryIndexAdapter` | Clean separation but adds adapter complexity |
| C. Graph-only | Use graph nodes for all boundary queries | Back-references work; but filtering by multiple facets is complex |

**Recommendation:** Hybrid approach:
1. **Graph nodes** for standardized values (versions, platforms) - enables back-references
2. **Facet index** in keyword adapter for filtering - fast intersection with keyword search

**Proposed facet structure:**
```typescript
interface BoundaryFacetIndex {
  contexts: string[];       // Normalized context labels
  packages: string[];       // Package names from versions
  platforms: string[];      // Platform identifiers from exclusions/prerequisites
  signalPatterns: string[]; // Normalized signal patterns
}
```

### 3.4 Normalization Strategy

**Question:** How to normalize boundary values for consistent indexing?

**Challenges:**
- Context labels: "Frontend" vs "frontend" vs "front-end"
- Version ranges: ">=16.8.0" vs "^16.8.0" vs "16.x"
- Package names: "@scope/package" vs "package"

**Recommendations:**
1. **Context labels:** Lowercase, replace spaces with hyphens
2. **Version constraints:** Store both raw range AND normalized package name
3. **Platforms:** Maintain a canonical platform vocabulary

### 3.5 Back-Reference Query Support

**Question:** How to find all entries matching a boundary constraint?

**Current graph infrastructure supports this:**
- `sourceIdsByNodeId` in `GraphRuntimeSnapshot` maps node ID → source entry IDs
- `buildGraphRuntimeSnapshot()` builds this index from documents

**Query pattern:**
```typescript
// Find all entries applicable in "frontend" context
const contextNode = 'boundary-context:frontend';
const sourceIds = runtime.sourceIdsByNodeId.get(contextNode);
```

**Missing:** Need to support compound queries (AND/OR of multiple constraints).

---

## 4. Integration Points

### 4.1 Files to Modify

| File | Change |
|------|--------|
| `packages/contracts/src/domain/boundary.ts` | No changes (schema complete from Phase 51) |
| `packages/server/src/lib/indexing/graph-lite/documents.ts` | Add new `GraphNodeKind` values, new `GraphRelationType` values |
| `packages/server/src/lib/retrieval/graph-extract.ts` | Add boundary extraction logic |
| `packages/server/src/lib/indexing/normalize.ts` | Include boundary in `NormalizedIndexDocument` |
| `packages/server/src/lib/indexing/types.ts` | Add `BoundaryFacetIndex` to types |
| `packages/server/src/lib/indexing/adapters/keyword.ts` | Add facet indexing |

### 4.2 Files to Create

| File | Purpose |
|------|---------|
| `packages/server/src/lib/indexing/boundary-extract.ts` | Extract boundary nodes/edges from `Boundary` object |
| `packages/server/src/lib/indexing/boundary-extract.test.ts` | Tests for boundary extraction |
| `packages/server/src/lib/indexing/boundary-normalize.ts` | Normalization helpers for boundary values |

### 4.3 Pipeline Integration

**Current flow:**
```
KnowledgeRecord → normalizeKnowledgeIndexDocument() → NormalizedIndexDocument
                → adapter.sync() for each adapter
```

**Extended flow:**
```
KnowledgeRecord → normalizeKnowledgeIndexDocument() → NormalizedIndexDocument
                → (new) extractBoundaryGraphEntities() → boundary nodes/edges
                → graph adapter: merge with trap nodes/edges
                → keyword adapter: merge boundary facets into PersistedKeywordState
```

---

## 5. Dependencies and Constraints

### 5.1 Phase Dependencies

```
Phase 51 (Boundary Schema) ──✓ COMPLETE
         ↓
Phase 52 (Boundary Capture) ──✓ COMPLETE
         ↓
Phase 53 (Boundary Indexing) ── THIS PHASE
         ↓
Phase 54 (Boundary-aware Retrieval)
```

**Requires from Phase 52:**
- `KnowledgeRecord.boundary` field populated
- `boundarySchema` available in contracts

**Provides for Phase 54:**
- Boundary facets queryable
- Boundary nodes traversable in graph
- Back-reference lookups functional

### 5.2 Constraints

1. **Backward compatibility:** Existing graph documents must remain valid
2. **No breaking changes:** `GraphNodeKind` extension is additive
3. **Performance:** Boundary extraction must be deterministic and fast
4. **Storage:** Graph documents grow with boundary nodes/edges

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Boundary data sparse initially | High | Low | Design for nullable boundaries; graceful degradation |
| Version normalization complex | Medium | Medium | Start with simple normalization; defer semver parsing to Phase 54 |
| Graph explosion with many boundary nodes | Low | Medium | Limit nodes per boundary layer (schema already has max 10 items per layer) |
| Facet index inconsistencies | Low | High | Normalize at extraction time; single source of truth |

---

## 7. Suggested Plan Structure

Based on this research, Phase 53 could be structured as:

### Plan 1: Graph Node/Edge Schema Extension
- Add new `GraphNodeKind` values to documents.ts
- Add new `GraphRelationType` values for boundaries
- Update graphology.ts edge validation if needed
- Update tests for new node/relation types

### Plan 2: Boundary Graph Extraction
- Create `boundary-extract.ts` module
- Implement `extractBoundaryGraphEntities()` function
- Normalize boundary values for node IDs
- Map boundary layers to appropriate node kinds
- Write unit tests for extraction

### Plan 3: Facet Index Integration
- Extend `NormalizedIndexDocument` with boundary data
- Add `BoundaryFacetIndex` to keyword adapter
- Update normalizer to include boundary
- Thread boundary through indexing pipeline
- Write integration tests

### Plan 4: Back-Reference Query Support
- Verify `sourceIdsByNodeId` works with boundary nodes
- Add helper function for boundary-constrained lookup
- Document query patterns for Phase 54
- Write tests for back-reference queries

---

## 8. Open Questions for Planner

1. **Version constraint normalization:** Should we parse semver ranges at index time or defer to query time? Parsing at index time enables range queries but adds complexity.

2. **Evidence nodes:** Should evidence references (issues, CVEs) become graph nodes? This could enable "find all entries related to CVE-2023-1234" queries.

3. **Exclusion handling:** Should exclusions create `excludes-*` edges or use a different mechanism? Exclusions are negative constraints that Phase 54 needs to penalize, not filter.

4. **Signal indexing:** Signals are patterns (keywords, regex, error codes). Should these become graph nodes or stay in a separate signal index for pattern matching?

---

## 9. Reference Files

| File | Relevance |
|------|-----------|
| `packages/contracts/src/domain/boundary.ts` | Boundary schema definition |
| `packages/contracts/src/domain/knowledge.ts` | Knowledge entry schema with boundary |
| `packages/server/src/lib/indexing/graph-lite/documents.ts` | Graph node/edge types |
| `packages/server/src/lib/retrieval/graph-extract.ts` | Existing graph extraction logic |
| `packages/server/src/lib/indexing/normalize.ts` | Document normalization |
| `packages/server/src/lib/indexing/adapters/keyword.ts` | Keyword adapter for facet integration |
| `packages/server/src/lib/indexing/pipeline.ts` | Indexing pipeline orchestration |
| `packages/server/src/lib/store.ts` | KnowledgeRecord with boundary field |
| `packages/server/src/lib/retrieval/filters.ts` | Retrieval filtering (Phase 54 integration point) |

---

*Research completed: 2026-05-02*
*Ready for planning*
