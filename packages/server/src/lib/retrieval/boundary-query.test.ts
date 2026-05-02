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

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEntryWithFacets(
  id: string,
  opts: {
    contexts?: string[];
    packages?: string[];
    platforms?: string[];
    hasIndexState?: boolean;
    hasBoundary?: boolean;
  } = {},
) {
  const entry: any = {
    id,
    boundary: opts.hasBoundary !== false
      ? { context: [], versions: [], exclusions: [], evidence: [], prerequisites: [], signals: [] }
      : null,
  };
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

function makeGraphDoc(
  sourceId: string,
  nodes: Array<{ kind: string; label: string }>,
): GraphIndexDocumentRecord {
  return {
    id: `graphdoc_trap_${sourceId}_r1`,
    sourceType: 'trap',
    sourceId,
    revision: 1,
    contentHash: 'abc123',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes: nodes.map((n, i) => ({
      id: `node_${i}`,
      kind: n.kind as any,
      label: n.label,
      evidence: `test evidence for ${n.label}`,
    })),
    edges: [],
    evidence: 'test graph document',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// findEntriesByBoundaryConstraint
// ---------------------------------------------------------------------------

describe('findEntriesByBoundaryConstraint', () => {
  it('returns empty for entries without index state', () => {
    const entries = [makeEntryWithFacets('e1', { hasIndexState: false })];
    const result = findEntriesByBoundaryConstraint(entries, { context: 'frontend' });
    expect(result).toHaveLength(0);
  });

  it('returns empty for entries with failed index state', () => {
    const entry: any = {
      id: 'e1',
      boundary: { context: [], versions: [], exclusions: [], evidence: [], prerequisites: [], signals: [] },
      indexState: { keyword: { status: 'failed' } },
    };
    const result = findEntriesByBoundaryConstraint([entry], { context: 'frontend' });
    expect(result).toHaveLength(0);
  });

  it('returns empty for entries without boundary', () => {
    const entries = [makeEntryWithFacets('e1', { hasBoundary: false, contexts: ['frontend'] })];
    const result = findEntriesByBoundaryConstraint(entries, { context: 'frontend' });
    expect(result).toHaveLength(0);
  });

  it('returns empty for entries without boundary facets', () => {
    const entry: any = {
      id: 'e1',
      boundary: { context: [], versions: [], exclusions: [], evidence: [], prerequisites: [], signals: [] },
      indexState: { keyword: { status: 'synced', persistedState: {} } },
    };
    const result = findEntriesByBoundaryConstraint([entry], { context: 'frontend' });
    expect(result).toHaveLength(0);
  });

  it('matches entry by context constraint', () => {
    const entries = [
      makeEntryWithFacets('e1', { contexts: ['frontend', 'production'] }),
      makeEntryWithFacets('e2', { contexts: ['backend'] }),
    ];
    const result = findEntriesByBoundaryConstraint(entries, { context: 'frontend' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('e1');
  });

  it('matches entry by platform constraint', () => {
    const entries = [
      makeEntryWithFacets('e1', { platforms: ['linux', 'darwin'] }),
      makeEntryWithFacets('e2', { platforms: ['windows'] }),
    ];
    const result = findEntriesByBoundaryConstraint(entries, { platform: 'linux' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('e1');
  });

  it('matches entry by package constraint', () => {
    const entries = [
      makeEntryWithFacets('e1', { packages: ['react'] }),
      makeEntryWithFacets('e2', { packages: ['vue'] }),
    ];
    const result = findEntriesByBoundaryConstraint(entries, { package: 'react' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('e1');
  });

  it('matches entries with multiple constraint fields', () => {
    const entries = [
      makeEntryWithFacets('e1', { contexts: ['frontend'], platforms: ['linux'] }),
      makeEntryWithFacets('e2', { contexts: ['frontend'], platforms: ['windows'] }),
      makeEntryWithFacets('e3', { contexts: ['backend'], platforms: ['linux'] }),
    ];
    const result = findEntriesByBoundaryConstraint(entries, { context: 'frontend', platform: 'linux' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('e1');
  });

  it('returns empty when no entries match', () => {
    const entries = [makeEntryWithFacets('e1', { contexts: ['backend'] })];
    const result = findEntriesByBoundaryConstraint(entries, { context: 'frontend' });
    expect(result).toHaveLength(0);
  });

  it('returns all entries with facets when constraint has no fields', () => {
    const entries = [
      makeEntryWithFacets('e1', { contexts: ['frontend'] }),
      makeEntryWithFacets('e2', { contexts: ['backend'] }),
      makeEntryWithFacets('e3', { hasIndexState: false }),
    ];
    const result = findEntriesByBoundaryConstraint(entries, {});
    expect(result).toHaveLength(2);
  });

  it('normalizes context labels for matching', () => {
    const entries = [makeEntryWithFacets('e1', { contexts: ['front-end'] })];
    // normalizeContextLabel lowercases and replaces spaces with hyphens
    const result = findEntriesByBoundaryConstraint(entries, { context: 'Front End' });
    expect(result).toHaveLength(1);
  });

  it('normalizes package names for matching', () => {
    const entries = [makeEntryWithFacets('e1', { packages: ['@scope/my-pkg'] })];
    const result = findEntriesByBoundaryConstraint(entries, { package: '@Scope/My-Pkg' });
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// findEntriesByGraphNode
// ---------------------------------------------------------------------------

describe('findEntriesByGraphNode', () => {
  it('finds entries with matching boundary-context node', () => {
    const docs = [
      makeGraphDoc('e1', [{ kind: 'boundary-context', label: 'frontend' }]),
      makeGraphDoc('e2', [{ kind: 'boundary-context', label: 'backend' }]),
    ];
    const result = findEntriesByGraphNode(docs, 'boundary-context', 'frontend');
    expect(result).toEqual(['e1']);
  });

  it('finds entries with matching boundary-platform node', () => {
    const docs = [
      makeGraphDoc('e1', [{ kind: 'boundary-platform', label: 'linux' }]),
      makeGraphDoc('e2', [{ kind: 'boundary-context', label: 'frontend' }]),
    ];
    const result = findEntriesByGraphNode(docs, 'boundary-platform', 'linux');
    expect(result).toEqual(['e1']);
  });

  it('finds entries with matching boundary-version node', () => {
    const docs = [
      makeGraphDoc('e1', [{ kind: 'boundary-version', label: 'react@>=16.8.0' }]),
    ];
    const result = findEntriesByGraphNode(docs, 'boundary-version', 'react@>=16.8.0');
    expect(result).toEqual(['e1']);
  });

  it('returns empty array when no match', () => {
    const docs = [
      makeGraphDoc('e1', [{ kind: 'boundary-context', label: 'frontend' }]),
    ];
    const result = findEntriesByGraphNode(docs, 'boundary-platform', 'linux');
    expect(result).toEqual([]);
  });

  it('deduplicates source IDs when multiple nodes match', () => {
    const docs = [
      makeGraphDoc('e1', [
        { kind: 'boundary-context', label: 'frontend' },
        { kind: 'boundary-context', label: 'production' },
        { kind: 'boundary-platform', label: 'linux' },
      ]),
      makeGraphDoc('e2', [{ kind: 'boundary-context', label: 'frontend' }]),
    ];
    const result = findEntriesByGraphNode(docs, 'boundary-context', 'frontend');
    expect(result).toEqual(['e1', 'e2']);
    expect(result).toHaveLength(2); // no duplicates
  });

  it('returns empty for empty graph docs array', () => {
    const result = findEntriesByGraphNode([], 'boundary-context', 'frontend');
    expect(result).toEqual([]);
  });
});
