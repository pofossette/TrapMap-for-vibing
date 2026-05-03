# Phase 53: Boundary Indexing & Graph Integration - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 5 (new/modified)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/domain/boundary.ts` | model | CRUD | `packages/contracts/src/domain/evidence.ts` | exact |
| `packages/contracts/src/index.ts` | config | CRUD | (itself - modification) | exact |
| `packages/contracts/src/domain/boundary.test.ts` | test | CRUD | `packages/contracts/src/domain/boundary.test.ts` (itself - extension) | exact |
| `packages/server/src/lib/retrieval/boundary-query.ts` | service | CRUD | `packages/server/src/lib/retrieval/boundary-match.ts` | exact |
| `packages/server/src/lib/retrieval/boundary-query.test.ts` | test | CRUD | `packages/server/src/lib/retrieval/boundary-match.test.ts` | exact |

## Pattern Assignments

### `packages/contracts/src/domain/boundary.ts` (model, CRUD) -- MODIFY

**Analog:** `packages/contracts/src/domain/evidence.ts` (schema + type export pattern)

**Current state (lines 1-158):** File already contains `boundarySchema`, `versionConstraintSchema`, and all sub-schemas with Zod type exports. Missing: `boundaryContextSchema`, `boundaryExplanationSchema`, `boundaryMetaSchema`, and the `BoundaryContext`/`BoundaryExplanation` type exports.

**Imports pattern** (line 1, same as existing):
```typescript
import { z } from 'zod';
```

**Schema + type export pattern** (from `evidence.ts` lines 32-43, lines 58-61):
```typescript
export const evidenceMetaSchema = z.object({
  sourceType: evidenceSourceTypeSchema,
  sourceRef: z.string().max(500).optional(),
  evidenceLevel: evidenceLevelSchema,
  verifiedAt: isoTimestampSchema,
  verifiedBy: actorRefSchema,
});
// ...later:
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;
```

**BoundaryContext schema shape** (must match usage in `boundary-match.ts` line 120, `boundary-match.test.ts` line 49, `filters.ts` line 18):
```typescript
// The BoundaryContext type is used as: { versions?: {package, version}[], contexts?: string[], platform?: string }
// Note: BoundaryContext.versions uses {package, version} (query version), NOT {package, range} (constraint)
export const boundaryContextSchema = z.object({
  contexts: z.array(z.string().min(1).max(64)).optional(),
  platform: z.string().min(1).max(64).optional(),
  versions: z.array(z.object({
    package: z.string().min(1).max(128),
    version: z.string().min(1).max(64),
  })).optional(),
});
export type BoundaryContext = z.infer<typeof boundaryContextSchema>;
```

**BoundaryExplanation schema shape** (must match `boundary-match.ts` lines 234, 300):
```typescript
// Return shape from buildBoundaryExplanation:
// { checked: boolean, requiredSatisfied: boolean, warnings: string[], boosts: string[] }
export const boundaryExplanationSchema = z.object({
  checked: z.boolean(),
  requiredSatisfied: z.boolean(),
  warnings: z.array(z.string()),
  boosts: z.array(z.string()),
});
export type BoundaryExplanation = z.infer<typeof boundaryExplanationSchema>;
```

**boundaryMetaSchema** (referenced in `artifacts.ts` line 13, line 369):
```typescript
// artifacts.ts uses: boundaryMeta: boundaryMetaSchema.nullable().optional()
// This should be the full Boundary schema re-exported under a different name
// or a lightweight subset. RESEARCH.md recommends defining as the full Boundary schema.
export const boundaryMetaSchema = boundarySchema;
```

**Type exports to add** (append after existing type exports at line 158):
```typescript
export type BoundaryContext = z.infer<typeof boundaryContextSchema>;
export type BoundaryExplanation = z.infer<typeof boundaryExplanationSchema>;
```

---

### `packages/contracts/src/index.ts` (config, CRUD) -- MODIFY

**Analog:** itself (add one line)

**Current state (lines 1-30):** All domain modules are re-exported except `boundary.ts`.

**Modification pattern** (add after line 6, alphabetically):
```typescript
export * from './domain/boundary.js';
```

This is the exact same pattern used by every other domain module (e.g., line 1 `export * from './domain/artifacts.js'`).

---

### `packages/contracts/src/domain/boundary.test.ts` (test, CRUD) -- MODIFY

**Analog:** itself (extend existing test file)

**Current state (lines 1-393):** Tests all existing schemas (`conditionKindSchema`, `signalKindSchema`, `exclusionKindSchema`, `evidenceKindSchema`, `versionConstraintSchema`, `boundaryConditionSchema`, `signalMatcherSchema`, `exclusionRuleSchema`, `evidenceReferenceSchema`, `boundarySchema`).

**Test pattern** (from existing file, lines 74-128):
```typescript
describe('versionConstraintSchema', () => {
  it('accepts valid semver range', () => {
    const constraint = versionConstraintSchema.parse({
      package: 'react',
      range: '>=16.8.0',
    });
    expect(constraint.package).toBe('react');
    expect(constraint.range).toBe('>=16.8.0');
  });

  it('rejects empty package name', () => {
    expect(() =>
      versionConstraintSchema.parse({
        package: '',
        range: '>=1.0.0',
      }),
    ).toThrow();
  });
});
```

**Imports to add** (extend import block at lines 2-13):
```typescript
import {
  // ...existing imports...
  boundaryContextSchema,
  boundaryExplanationSchema,
  boundaryMetaSchema,
} from './boundary.js';
```

**New test sections to add:**
- `describe('boundaryContextSchema', ...)` -- valid with all fields, valid with only contexts, valid with only platform, valid with only versions, valid with empty versions array, rejects invalid platform type, rejects context item over 64 chars
- `describe('boundaryExplanationSchema', ...)` -- valid with all fields, valid with empty warnings/boosts, rejects missing checked field, rejects wrong type for warnings
- `describe('boundaryMetaSchema', ...)` -- aliases boundarySchema (parse same data), defaults all layers to empty arrays

---

### `packages/server/src/lib/retrieval/boundary-query.ts` (service, CRUD) -- NEW FILE

**Analog:** `packages/server/src/lib/retrieval/boundary-match.ts`

**Imports pattern** (from `boundary-match.ts` lines 1-13):
```typescript
/**
 * Back-reference query helper for boundary-constrained entry lookup.
 *
 * Provides:
 * - findEntriesByBoundaryConstraint: Scan indexed facets to find entries matching a boundary constraint
 * - findEntriesByGraphNode: Find entries containing a specific boundary graph node
 *
 * All functions are pure (no side effects, no I/O).
 */

import type { BoundaryContext } from '@trapmap/contracts';
import type { KnowledgeRecord } from '../store.js';
import { normalizeContextLabel, normalizePackageName } from '../indexing/boundary-normalize.js';
import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';
```

**Core pattern -- facet-based back-reference query** (derived from `boundary-match.ts` lines 116-148 `filterByBoundary`):
```typescript
/**
 * Constraint for back-reference queries.
 * Each field narrows the result set independently.
 */
export interface BoundaryQueryConstraint {
  context?: string;
  platform?: string;
  package?: string;
}

/**
 * Find all knowledge entries matching a boundary constraint.
 * Scans pre-indexed boundary facets from the keyword adapter persisted state.
 *
 * @param entries - Knowledge entries with index state
 * @param constraint - Boundary constraint to match
 * @returns Entries whose indexed boundary facets match all constraint fields
 */
export function findEntriesByBoundaryConstraint(
  entries: KnowledgeRecord[],
  constraint: BoundaryQueryConstraint,
): KnowledgeRecord[] {
  return entries.filter(entry => {
    // Access indexed boundary facets from keyword adapter persisted state
    const keywordState = entry.indexState?.keyword;
    if (!keywordState || keywordState.status !== 'synced') return false;

    const facets = (keywordState as any).persistedState?.boundaryFacets;
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

**Core pattern -- graph-based back-reference query** (derived from `documents.ts` GraphIndexDocumentRecord structure):
```typescript
/**
 * Find entry IDs containing a specific boundary graph node.
 *
 * @param graphDocs - Graph index documents to scan
 * @param nodeKind - Boundary node kind to match
 * @param nodeLabel - Node label to match
 * @returns Source IDs of documents containing the matching node
 */
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
  return [...new Set(entryIds)];
}
```

---

### `packages/server/src/lib/retrieval/boundary-query.test.ts` (test, CRUD) -- NEW FILE

**Analog:** `packages/server/src/lib/retrieval/boundary-match.test.ts`

**Test file pattern** (from `boundary-match.test.ts` lines 1-23):
```typescript
/**
 * Tests for boundary back-reference query helpers.
 *
 * BOUND-03: Back-references queryable -- find all entries matching a boundary constraint.
 *
 * Tests cover:
 * - findEntriesByBoundaryConstraint: facet-based entry lookup
 * - findEntriesByGraphNode: graph-based entry lookup
 */

import { describe, it, expect } from 'vitest';

import {
  findEntriesByBoundaryConstraint,
  findEntriesByGraphNode,
} from './boundary-query.js';
import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';
```

**Test fixture pattern** (from `boundary-match.test.ts` lines 234-257 -- helper functions for creating test entries):
```typescript
function makeEntryWithFacets(
  id: string,
  opts: {
    contexts?: string[];
    packages?: string[];
    platforms?: string[];
    hasIndexState?: boolean;
  } = {},
) {
  const entry: any = { id, boundary: { context: [], versions: [], exclusions: [], evidence: [], prerequisites: [], signals: [] } };
  if (opts.hasIndexState !== false) {
    entry.indexState = {
      keyword: {
        status: 'synced',
        persistedState: {
          boundaryFacets: {
            contexts: opts.contexts ?? [],
            packages: opts.packages ?? [],
            platforms: opts.platforms ?? [],
            versionConstraints: [],
          },
        },
      },
    };
  }
  return entry;
}
```

**Test describe pattern** (from `boundary-match.test.ts`):
```typescript
describe('findEntriesByBoundaryConstraint', () => {
  it('returns empty for entries without index state', () => { ... });
  it('matches entry by context constraint', () => { ... });
  it('matches entry by platform constraint', () => { ... });
  it('matches entry by package constraint', () => { ... });
  it('matches entries with multiple constraint fields', () => { ... });
  it('returns empty when no entries match', () => { ... });
  it('skips entries with failed index state', () => { ... });
});

describe('findEntriesByGraphNode', () => {
  it('finds entries with matching boundary-context node', () => { ... });
  it('finds entries with matching boundary-platform node', () => { ... });
  it('returns empty array when no match', () => { ... });
  it('deduplicates source IDs', () => { ... });
});
```

---

## Shared Patterns

### Zod Schema + Type Export Convention
**Source:** `packages/contracts/src/domain/evidence.ts`, `packages/contracts/src/domain/boundary.ts`
**Apply to:** All schema additions in `boundary.ts`
```typescript
// 1. Define schema with z.object()
export const mySchema = z.object({ ... });
// 2. Export inferred type
export type MyType = z.infer<typeof mySchema>;
```

### Pure Function Convention for Retrieval Helpers
**Source:** `packages/server/src/lib/retrieval/boundary-match.ts` lines 9-10
**Apply to:** `boundary-query.ts`
```typescript
/**
 * [Doc comment explaining purpose]
 * All functions are pure (no side effects, no I/O).
 */
```
No external state, no mutations, no I/O. Functions take input arrays and return new arrays.

### Barrel Export Convention
**Source:** `packages/contracts/src/index.ts`
**Apply to:** Adding boundary module export
```typescript
export * from './domain/boundary.js';
```

### Access Pattern for Indexed Boundary Facets
**Source:** `packages/server/src/lib/indexing/adapters/keyword.ts` lines 374-378
**Apply to:** `boundary-query.ts` back-reference lookup
```typescript
// Pattern for reading indexed facets from KnowledgeRecord:
if (entry.indexState?.keyword?.status === 'synced') {
  const persistedState = (entry.indexState.keyword as IndexStateKeyword).persistedState;
  const facets = persistedState?.boundaryFacets;
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | -- | -- | All files have close analogs in the codebase |

## Metadata

**Analog search scope:**
- `packages/contracts/src/domain/` (all schema files)
- `packages/server/src/lib/retrieval/` (all retrieval modules)
- `packages/server/src/lib/indexing/` (all indexing modules)
- `packages/server/src/lib/indexing/adapters/` (all adapter modules)
- `packages/server/src/lib/indexing/graph-lite/` (graph document types)

**Files scanned:** 18
**Pattern extraction date:** 2026-05-03
