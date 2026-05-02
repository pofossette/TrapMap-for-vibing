import { describe, expect, it } from 'vitest';

import type { Boundary } from '@trapmap/contracts';
import { extractBoundaryGraphEntities } from './boundary-extract.js';

describe('extractBoundaryGraphEntities', () => {
  const trapNodeId = 'trap:test-entry';

  it('returns empty result for null boundary', () => {
    const result = extractBoundaryGraphEntities(trapNodeId, null);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.facets.contexts).toHaveLength(0);
    expect(result.facets.packages).toHaveLength(0);
  });

  it('extracts context nodes with applies-in edges', () => {
    const boundary: Boundary = {
      context: ['frontend', 'production'],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    };

    const result = extractBoundaryGraphEntities(trapNodeId, boundary);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]?.kind).toBe('boundary-context');
    expect(result.nodes[0]?.id).toBe('boundary-context:frontend');
    expect(result.nodes[1]?.id).toBe('boundary-context:production');

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]?.relationType).toBe('applies-in');
    expect(result.edges[0]?.sourceNodeId).toBe(trapNodeId);
    expect(result.edges[0]?.targetNodeId).toBe('boundary-context:frontend');

    expect(result.facets.contexts).toContain('frontend');
    expect(result.facets.contexts).toContain('production');
  });

  it('extracts version constraint nodes with requires-version edges', () => {
    const boundary: Boundary = {
      context: [],
      versions: [
        { package: 'react', range: '>=16.8.0', note: 'hooks support' },
        { package: 'node', range: '^18.0.0' },
      ],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    };

    const result = extractBoundaryGraphEntities(trapNodeId, boundary);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]?.kind).toBe('boundary-version');
    expect(result.nodes[0]?.id).toBe('boundary-version:react@>=16.8.0');
    expect(result.nodes[0]?.label).toBe('react@>=16.8.0');

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]?.relationType).toBe('requires-version');
    expect(result.edges[0]?.strength).toBe('hard'); // Version requirements are hard
    expect(result.edges[0]?.sourceNodeId).toBe(trapNodeId);

    expect(result.facets.packages).toContain('react');
    expect(result.facets.packages).toContain('node');
    expect(result.facets.versionConstraints).toContain('react@>=16.8.0');
  });

  it('extracts platform nodes from exclusions', () => {
    const boundary: Boundary = {
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [
        { description: 'Not applicable on Windows', kind: 'platform' },
        { description: 'Docker only', kind: 'platform' },
      ],
      evidence: [],
    };

    const result = extractBoundaryGraphEntities(trapNodeId, boundary);

    // Windows and docker should be extracted
    expect(result.nodes.some((n) => n.label === 'windows')).toBe(true);
    expect(result.nodes.some((n) => n.label === 'docker')).toBe(true);

    // Check for excludes-context edges
    const excludeEdges = result.edges.filter((e) => e.relationType === 'excludes-context');
    expect(excludeEdges.length).toBeGreaterThan(0);
    expect(excludeEdges[0]?.strength).toBe('soft'); // Exclusions are soft constraints
  });

  it('deduplicates nodes with same ID', () => {
    const boundary: Boundary = {
      context: ['frontend', 'Frontend', 'FRONTEND'], // Same after normalization
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    };

    const result = extractBoundaryGraphEntities(trapNodeId, boundary);

    // All three normalize to 'frontend'
    const contextNodes = result.nodes.filter((n) => n.kind === 'boundary-context');
    expect(contextNodes).toHaveLength(1);
    expect(contextNodes[0]?.id).toBe('boundary-context:frontend');
  });

  it('handles empty boundary', () => {
    const boundary: Boundary = {
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    };

    const result = extractBoundaryGraphEntities(trapNodeId, boundary);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});
