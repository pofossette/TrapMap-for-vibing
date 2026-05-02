# Phase 53: Boundary Indexing & Graph Integration - Research

**Researched:** 2026-05-03
**Domain:** Boundary facet indexing, graph node/edge integration, and back-reference queries
**Confidence:** HIGH

## Summary

Phase 53 (BOUND-03) requires indexing boundary fields as facets for filtering and as graph nodes with back-references. The codebase already contains significant infrastructure built during Phases 51-52: the `Boundary` Zod schema in contracts, `boundary-extract.ts` for graph entity extraction, `boundary-normalize.ts` for value normalization, and `boundary-match.ts` for retrieval-time filtering/scoring. The graph adapter in `adapters/graph.ts` already calls `extractBoundaryGraphEntities` and merges boundary nodes/edges into graph documents.

However, there is a critical gap: `BoundaryContext` and `BoundaryExplanation` types are imported from `@trapmap/contracts` by server modules (boundary-match.ts, filters.ts, rerank.ts, types.ts) but are **not actually defined or exported** from the contracts package. The `boundary.ts` module itself is not even exported from `packages/contracts/src/index.ts`. This causes TypeScript compilation errors that must be resolved as part of this phase. The `boundaryMetaSchema` referenced in artifacts.ts is also undefined in boundary.ts.

The existing keyword adapter already stores `boundaryFacets` (from `buildBoundaryFacetIndex`) in its persisted state, and the graph adapter already indexes boundary nodes/edges. What remains is: (1) exporting boundary types from contracts, (2) defining `BoundaryContext` and `BoundaryExplanation` schemas/types, (3) adding a back-reference query function to find all entries matching a boundary constraint, and (4) ensuring the retrieval pipeline correctly reads boundary facets for filtering.

**Primary recommendation:** Define `BoundaryContext` and `BoundaryExplanation` in contracts/boundary.ts, export the boundary module from the contracts barrel, add a back-reference query helper, and resolve all TypeScript compilation errors.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions -- discuss phase was skipped per user setting.

### Claude's Discretion
All implementation choices are at Claude's discretion -- discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase was skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOUND-03 | Boundary fields indexed as facets in search index for filtering; standardized boundary values stored as graph nodes; graph edges connect knowledge entries to boundary nodes with relationship types; back-references queryable | Contracts export + BoundaryContext/BoundaryExplanation schema definitions (Section: Standard Stack), graph node/edge extraction already exists in boundary-extract.ts, keyword facet indexing already exists via buildBoundaryFacetIndex, back-reference query helper needed |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Boundary schema definition | contracts (shared types) | -- | Zod schemas and types are the single source of truth across all packages |
| Boundary facet indexing | server/indexing (keyword adapter) | -- | Keyword adapter already persists boundaryFacets in indexState |
| Boundary graph node extraction | server/indexing (graph adapter) | -- | Graph adapter already merges boundary entities via extractBoundaryGraphEntities |
| Back-reference queries | server/retrieval | server/store | Query helper scans store data using indexed boundary facets |
| BoundaryContext definition | contracts | -- | Shared type needed by server/retrieval and future API routes |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | already installed | Schema definition for BoundaryContext, BoundaryExplanation | Already used throughout contracts for all schemas [VERIFIED: codebase grep] |
| graphology | already installed | Graph structure for boundary node traversal | Already used in graph-lite/graphology.ts [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | already installed | Test framework for boundary indexing tests | All test files use vitest [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom back-reference scan | Full-text search index (e.g., MeiliSearch) | Overkill for current scale; in-memory scan over stored facets is sufficient for the JSON store |

**Installation:** No new packages needed.

**Version verification:** All dependencies already installed in project.

## Architecture Patterns

### System Architecture Diagram

```
                    Knowledge Entry (with boundary)
                              |
                              v
                    normalizeKnowledgeIndexDocument()
                    (includes boundary: entry.boundary)
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
      keyword adapter   vector adapter   graph adapter
              |               |               |
              v               v               v
     buildBoundaryFacetIndex   (no change)   extractBoundaryGraphEntities()
     -> persistedState.                      -> boundary-context nodes
        boundaryFacets                        -> boundary-version nodes
        {contexts, packages,                  -> boundary-platform nodes
         platforms,                           -> applies-in edges
         versionConstraints}                  -> requires-version edges
              |                               -> excludes-context edges
              |                               -> excludes-version edges
              |                               |
              v                               v
     indexState.keyword.              GraphIndexDocumentRecord
       persistedState.                 stored in graphIndexDocuments[]
       boundaryFacets
              |                               |
              +---------------+---------------+
                              |
                              v
                   Back-Reference Query
                   "Find all entries matching
                    boundary constraint X"
                              |
                              v
                   Scan indexState / graphIndex
                   Return matching entry IDs
```

### Recommended Project Structure
```
packages/contracts/src/domain/
  boundary.ts              # ADD: BoundaryContext schema, BoundaryExplanation schema, boundaryMetaSchema export
  index.ts                 # MODIFY: Add re-export of boundary.ts

packages/server/src/lib/indexing/
  boundary-extract.ts      # EXISTS: Graph entity extraction (complete)
  boundary-normalize.ts    # EXISTS: Value normalization (complete)

packages/server/src/lib/indexing/adapters/
  keyword.ts               # EXISTS: Stores boundaryFacets (complete)
  graph.ts                 # EXISTS: Merges boundary nodes/edges (complete)

packages/server/src/lib/retrieval/
  boundary-match.ts        # EXISTS: filterByBoundary, computeBoundaryScoreDelta, buildBoundaryExplanation
  boundary-query.ts        # ADD: Back-reference query helper
```

### Pattern 1: Contracts-First Type Definition
**What:** Define all shared types as Zod schemas in contracts/domain/, export from contracts barrel
**When to use:** Any type shared between packages
**Example:**
```typescript
// packages/contracts/src/domain/boundary.ts
export const boundaryContextSchema = z.object({
  contexts: z.array(z.string()).optional(),
  platform: z.string().optional(),
  versions: z.array(z.object({
    package: z.string(),
    version: z.string(),
  })).optional(),
});
export type BoundaryContext = z.infer<typeof boundaryContextSchema>;
```
[VERIFIED: existing pattern in codebase - all types follow this convention]

### Pattern 2: Facet Index in Keyword Adapter
**What:** Boundary values stored as facets in keyword adapter's persisted state for filtering
**When to use:** When boundary constraints need to be queryable during retrieval
**Example:**
```typescript
// Already implemented in keyword adapter:
boundaryFacets: buildBoundaryFacetIndex(document.boundary)
// Returns: { contexts: string[], packages: string[], platforms: string[], versionConstraints: string[] }
```
[VERIFIED: keyword.ts lines 81, 158]

### Pattern 3: Back-Reference Query via Store Scan
**What:** Query all entries matching a boundary constraint by scanning indexed facets
**When to use:** When user needs "find all entries applicable to context X"
**Example:**
```typescript
export function findEntriesByBoundary(
  entries: KnowledgeRecord[],
  constraint: { context?: string; platform?: string; package?: string },
): KnowledgeRecord[] {
  return entries.filter(entry => {
    const facets = getIndexedBoundaryFacets(entry);
    if (!facets) return false;
    if (constraint.context && !facets.contexts.includes(normalizeContextLabel(constraint.context))) return false;
    if (constraint.platform && !facets.platforms.includes(constraint.platform)) return false;
    if (constraint.package && !facets.packages.includes(normalizePackageName(constraint.package))) return false;
    return true;
  });
}
```
[ASSUMED: pattern based on existing boundary-match.ts and filter patterns]

### Anti-Patterns to Avoid
- **Defining types in server instead of contracts:** BoundaryContext and BoundaryExplanation are already imported from `@trapmap/contracts` in multiple server files. They MUST be defined there, not in server.
- **Duplicating boundary facet logic:** The `buildBoundaryFacetIndex` function already exists and is already called by the keyword adapter. Do not recreate this logic.
- **Modifying graph node kinds or relation types:** The vocabulary in `documents.ts` already includes `boundary-context`, `boundary-version`, `boundary-platform` node kinds and `applies-in`, `requires-version`, `excludes-context`, `excludes-version` relation types. Do not add new ones unless absolutely necessary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boundary value normalization | Custom string normalization | `normalizeContextLabel`, `normalizePackageName`, `buildContextNodeId` in boundary-normalize.ts | Already handles edge cases (uppercase, spaces, special chars, length limits) |
| Graph entity extraction from boundary | New extraction logic | `extractBoundaryGraphEntities` in boundary-extract.ts | Already handles context, version, platform extraction with deduplication |
| Facet index building | New facet builder | `buildBoundaryFacetIndex` in boundary-normalize.ts | Already normalizes and deduplicates all boundary facets |

**Key insight:** Phases 51-52 already built the extraction and normalization infrastructure. Phase 53 is primarily about: (1) completing the contracts layer exports, (2) adding a back-reference query, and (3) resolving TypeScript compilation errors.

## Common Pitfalls

### Pitfall 1: Missing Contracts Barrel Export
**What goes wrong:** `boundary.ts` is not exported from `packages/contracts/src/index.ts`, so all imports from `@trapmap/contracts` fail for boundary types.
**Why it happens:** The boundary module was added in Phase 51 but the barrel export was never added.
**How to avoid:** Add `export * from './domain/boundary.js'` to the contracts index.
**Warning signs:** TypeScript errors: `Module '"@trapmap/contracts"' has no exported member 'BoundaryContext'`

### Pitfall 2: Undefined `boundaryMetaSchema` Reference
**What goes wrong:** `artifacts.ts` imports `boundaryMetaSchema` from `./boundary.js` but it is not defined there.
**Why it happens:** Schema was referenced but never created.
**How to avoid:** Define `boundaryMetaSchema` in boundary.ts (likely a subset of the full boundary schema for artifact use).
**Warning signs:** TypeScript compilation error in artifacts.ts.

### Pitfall 3: BoundaryContext Shape Mismatch
**What goes wrong:** The `BoundaryContext` shape used in test files (`{ versions: [...], contexts: [...], platform: '...' }`) must match the schema definition exactly.
**Why it happens:** Tests already exist for boundary-match.ts using implicit types -- the schema must match the shape already assumed by those tests.
**How to avoid:** Define `BoundaryContext` schema to match the shape already used in boundary-match.test.ts and filters.ts: `{ versions?: {package, version}[], contexts?: string[], platform?: string }`.
**Warning signs:** Existing tests fail after adding the schema.

### Pitfall 4: Back-Reference Query Performance
**What goes wrong:** Scanning all entries for boundary matching could be slow with large datasets.
**Why it happens:** JSON store has no index structures.
**How to avoid:** Use the already-indexed `boundaryFacets` from keyword adapter persisted state rather than re-parsing boundary objects. The facets are pre-normalized and deduplicated.
**Warning signs:** Query takes >100ms on datasets with >1000 entries.

## Code Examples

### BoundaryContext Schema Definition (needed in contracts)
```typescript
// packages/contracts/src/domain/boundary.ts -- ADD these schemas

export const boundaryVersionQuerySchema = z.object({
  package: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
});

export const boundaryContextSchema = z.object({
  contexts: z.array(z.string().min(1).max(64)).optional(),
  platform: z.string().min(1).max(64).optional(),
  versions: z.array(boundaryVersionQuerySchema).optional(),
});

export type BoundaryContext = z.infer<typeof boundaryContextSchema>;
```
[Source: inferred from existing usage in boundary-match.ts, filters.ts, rerank.ts]

### BoundaryExplanation Schema Definition (needed in contracts)
```typescript
// packages/contracts/src/domain/boundary.ts -- ADD this schema

export const boundaryExplanationSchema = z.object({
  checked: z.boolean(),
  requiredSatisfied: z.boolean(),
  warnings: z.array(z.string()),
  boosts: z.array(z.string()),
});

export type BoundaryExplanation = z.infer<typeof boundaryExplanationSchema>;
```
[Source: VERIFIED from existing usage in boundary-match.ts `buildBoundaryExplanation` return shape]

### Back-Reference Query Helper (new file)
```typescript
// packages/server/src/lib/retrieval/boundary-query.ts
import type { KnowledgeRecord } from '../store.js';
import { normalizeContextLabel, normalizePackageName } from '../indexing/boundary-normalize.js';

interface BoundaryQueryConstraint {
  context?: string;
  platform?: string;
  package?: string;
}

export function findEntriesByBoundaryConstraint(
  entries: KnowledgeRecord[],
  constraint: BoundaryQueryConstraint,
): KnowledgeRecord[] {
  return entries.filter(entry => {
    const facets = entry.indexState?.keyword?.status === 'synced'
      ? (entry.indexState.keyword as any).persistedState?.boundaryFacets
      : null;
    if (!facets || !entry.boundary) return false;

    if (constraint.context) {
      const normalized = normalizeContextLabel(constraint.context);
      if (!facets.contexts?.includes(normalized)) return false;
    }
    if (constraint.platform) {
      if (!facets.platforms?.includes(constraint.platform)) return false;
    }
    if (constraint.package) {
      const normalized = normalizePackageName(constraint.package);
      if (!facets.packages?.includes(normalized)) return false;
    }
    return true;
  });
}
```
[Source: pattern derived from existing filterByBoundary in boundary-match.ts]

### Graph-Based Back-Reference Query (using existing graph index)
```typescript
// Alternative approach using graph index documents
import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';

export function findEntriesByGraphNode(
  graphDocs: GraphIndexDocumentRecord[],
  nodeKind: 'boundary-context' | 'boundary-version' | 'boundary-platform',
  nodeLabel: string,
): string[] {
  const entryIds: string[] = [];
  for (const doc of graphDocs) {
    const hasMatchingNode = doc.nodes.some(
      n => n.kind === nodeKind && n.label === nodeLabel,
    );
    if (hasMatchingNode) {
      entryIds.push(doc.sourceId);
    }
  }
  return entryIds;
}
```
[Source: pattern derived from existing graph-lite/documents.ts structure]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Boundary stored only on entry | Boundary indexed as facets + graph nodes | Phase 51-52 (already done) | Enables O(1) boundary filtering instead of re-parsing |
| No boundary context in retrieval query | BoundaryContext in query + boundary matching in pipeline | Phase 52 (partial, types missing) | Enables boundary-aware retrieval |

**Deprecated/outdated:**
- Direct boundary object parsing during retrieval: Use pre-indexed `boundaryFacets` from keyword adapter persisted state instead.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `boundaryMetaSchema` should be a lightweight subset of the full boundary schema for artifact use | Don't Hand-Roll | Artifacts.ts import breaks; need to check what shape artifacts actually need |
| A2 | Back-reference query should use facet-based scanning rather than graph traversal | Architecture Patterns | If graph traversal is needed, the query function design changes |
| A3 | `BoundaryContext.versions` uses `version` field (not `range`) based on test usage in boundary-match.test.ts | Code Examples | Schema mismatch with existing test data |
| A4 | Phase 53 success criterion "back-references queryable" means a helper function, not an API endpoint | Code Examples | May need to expose as an API route if planner decides otherwise |

## Open Questions

1. **`boundaryMetaSchema` Shape**
   - What we know: `artifacts.ts` imports it from `./boundary.js` and uses it as `boundaryMeta: boundaryMetaSchema.nullable().optional()`
   - What's unclear: What fields should `boundaryMetaSchema` contain? It's referenced on artifact records but we need to determine if it's the full `Boundary` schema or a subset.
   - Recommendation: Define it as the full `Boundary` schema re-exported under a different name, or as a lightweight subset. Check artifact test fixtures for the expected shape.

2. **Back-Reference Query Scope**
   - What we know: The success criterion says "Back-references queryable: find all entries matching a boundary constraint"
   - What's unclear: Is this a server-internal function, a new API endpoint, or both?
   - Recommendation: Start with a server-internal helper function. API endpoint can be added in a later phase if needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | Yes | 22.x | -- |
| pnpm | Package management | Yes | 9.x | -- |
| vitest | Testing | Yes | (installed) | -- |
| TypeScript | Type checking | Yes | 5.x | -- |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** N/A

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | vitest.config.ts (monorepo root) |
| Quick run command | `pnpm vitest run --project server -t boundary` |
| Full suite command | `pnpm vitest run --project server` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOUND-03 | Boundary fields indexed as facets | unit | `pnpm vitest run --project server src/lib/indexing/adapters/keyword.test.ts` | Yes (partial) |
| BOUND-03 | Boundary values stored as graph nodes | unit | `pnpm vitest run --project server src/lib/indexing/boundary-extract.test.ts` | Yes (complete) |
| BOUND-03 | Graph edges connect entries to boundary nodes | unit | `pnpm vitest run --project server src/lib/indexing/adapters/graph.test.ts` | Yes (partial) |
| BOUND-03 | Back-references queryable | unit | `pnpm vitest run --project server src/lib/retrieval/boundary-query.test.ts` | No -- Wave 0 |
| BOUND-03 | BoundaryContext schema validates | unit | `pnpm vitest run --project contracts src/domain/boundary.test.ts` | Yes (partial) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project server -t boundary`
- **Per wave merge:** `pnpm vitest run --project server && pnpm vitest run --project contracts`
- **Phase gate:** `pnpm typecheck && pnpm vitest run`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/retrieval/boundary-query.test.ts` -- covers back-reference query
- [ ] `packages/contracts/src/domain/boundary.test.ts` -- extend to cover BoundaryContext and BoundaryExplanation schemas

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | SecurityLevel filtering on boundary query results (requiredLevel) |
| V5 Input Validation | yes | Zod schemas for BoundaryContext, BoundaryExplanation |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for TypeScript/Zod

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Schema bypass | Tampering | Zod `.parse()` on all external input |
| Boundary context injection | Tampering | String length limits in schema (max 64/128) |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All claims verified by reading source files directly
- `packages/contracts/src/domain/boundary.ts` -- boundary schema definitions
- `packages/server/src/lib/indexing/boundary-extract.ts` -- graph extraction
- `packages/server/src/lib/indexing/boundary-normalize.ts` -- normalization
- `packages/server/src/lib/indexing/adapters/keyword.ts` -- facet indexing
- `packages/server/src/lib/indexing/adapters/graph.ts` -- graph integration
- `packages/server/src/lib/retrieval/boundary-match.ts` -- matching logic
- `packages/server/src/lib/retrieval/boundary-match.test.ts` -- existing tests

### Secondary (MEDIUM confidence)
- TypeScript compilation check confirmed missing types: BoundaryContext, BoundaryExplanation, boundaryMetaSchema

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, verified by codebase grep
- Architecture: HIGH - existing infrastructure already does 80% of the work; gaps are clearly identified
- Pitfalls: HIGH - TypeScript compilation errors confirmed, missing exports confirmed

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable codebase)
