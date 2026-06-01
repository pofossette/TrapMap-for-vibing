import { describe, expect, it } from 'vitest';

import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import {
  buildGraphSourceKey,
  normalizeGraphLabel,
  projectGraphDocument,
} from './projector.js';

function makeGraphDocument(
  overrides: Partial<GraphIndexDocumentRecord> = {},
): GraphIndexDocumentRecord {
  const now = nowIso();
  return {
    id: 'graphdoc_trap_trap-1_r1',
    sourceType: 'trap',
    sourceId: 'trap-1',
    revision: 1,
    contentHash: 'hash-1',
    teamId: 'team-1',
    scope: 'project',
    requiredLevel: 3,
    nodes: [
      {
        id: 'trap:trap-1',
        kind: 'trap',
        label: 'Docker Timeout',
        evidence: 'trap evidence',
      },
      {
        id: 'tool:docker',
        kind: 'tool',
        label: 'Docker',
        evidence: 'node evidence',
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceNodeId: 'trap:trap-1',
        targetNodeId: 'tool:docker',
        relationType: 'requires',
        strength: 'hard',
        evidence: 'edge evidence',
      },
    ],
    evidence: 'document evidence',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('projectGraphDocument', () => {
  it('projects trap documents into source, node, and relationship rows', () => {
    const document = makeGraphDocument();

    const projected = projectGraphDocument(document);

    expect(projected.source).toMatchObject({
      key: 'trap:trap-1',
      sourceType: 'trap',
      sourceId: 'trap-1',
      requiredLevel: 3,
      scope: 'project',
      teamId: 'team-1',
    });
    expect(projected.nodes).toEqual([
      expect.objectContaining({
        id: 'trap:trap-1',
        normalizedLabel: 'docker-timeout',
        kind: 'trap',
      }),
      expect.objectContaining({
        id: 'tool:docker',
        normalizedLabel: 'docker',
        kind: 'tool',
      }),
    ]);
    expect(projected.relationships).toEqual([
      expect.objectContaining({
        key: 'trap:trap-1:edge-1',
        sourceKey: 'trap:trap-1',
        relationType: 'requires',
        strength: 'hard',
      }),
    ]);
  });

  it('projects skill documents and preserves mitigation metadata', () => {
    const document = makeGraphDocument({
      id: 'graphdoc_skill_skill-1_r2',
      sourceType: 'skill',
      sourceId: 'skill-1',
      revision: 2,
      nodes: [
        {
          id: 'skill:skill-1',
          kind: 'skill',
          label: 'Restart Service',
          evidence: 'skill evidence',
          mitigates: ['trap:trap-1'],
        },
      ],
      edges: [],
    });

    const projected = projectGraphDocument(document);

    expect(projected.source.key).toBe('skill:skill-1');
    expect(projected.nodes).toEqual([
      expect.objectContaining({
        id: 'skill:skill-1',
        kind: 'skill',
        mitigates: ['trap:trap-1'],
      }),
    ]);
  });

  it('normalizes graph labels and source keys deterministically', () => {
    expect(normalizeGraphLabel('  Docker Compose  ')).toBe('docker-compose');
    expect(buildGraphSourceKey('skill', 'artifact-1')).toBe('skill:artifact-1');
  });
});
