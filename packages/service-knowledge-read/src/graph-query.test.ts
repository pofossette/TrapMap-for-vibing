import type { GraphIndexDocumentRecord, GraphIndexRepositoryPort } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryGraphQueryBackend } from './graph-query.js';

const trapDocument: GraphIndexDocumentRecord = {
  id: 'graphdoc_trap_t1_r1',
  sourceType: 'trap',
  sourceId: 't1',
  revision: 1,
  contentHash: 'trap-hash',
  teamId: null,
  scope: 'global',
  requiredLevel: 0,
  nodes: [
    {
      id: 'trap:t1',
      kind: 'trap',
      label: 'Database migration',
      evidence: 'Migration can block deployment.',
    },
    {
      id: 'skill:s1',
      kind: 'skill',
      label: 'Safe migration',
      evidence: 'Use the migration skill.',
    },
  ],
  edges: [
    {
      id: 'edge:s1-mitigates-t1',
      sourceNodeId: 'skill:s1',
      targetNodeId: 'trap:t1',
      relationType: 'mitigates',
      strength: 'soft',
      evidence: 'The skill mitigates the trap.',
    },
  ],
  evidence: 'Trap graph evidence.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const skillDocument: GraphIndexDocumentRecord = {
  ...trapDocument,
  id: 'graphdoc_skill_s1_r1',
  sourceType: 'skill',
  sourceId: 's1',
  contentHash: 'skill-hash',
  nodes: [trapDocument.nodes[1]!],
  edges: [],
  evidence: 'Skill graph evidence.',
};

function createRepositoryFake(documents: GraphIndexDocumentRecord[]): GraphIndexRepositoryPort {
  return {
    insert: vi.fn(),
    getById: vi.fn(),
    listBySource: vi.fn(),
    listAll: vi.fn().mockResolvedValue(documents),
    upsert: vi.fn(),
    remove: vi.fn(),
    removeBySource: vi.fn(),
  };
}

describe('createMemoryGraphQueryBackend', () => {
  it('delegates writes and serves the owner-local graph query surface', async () => {
    const repo = createRepositoryFake([trapDocument, skillDocument]);
    const backend = createMemoryGraphQueryBackend(repo);

    expect(backend.getRuntimeState()).toEqual({
      backendKind: 'memory',
      failOpen: false,
      mode: 'disabled',
    });

    await backend.upsertDocument(trapDocument);
    expect(repo.upsert).toHaveBeenCalledWith(trapDocument);

    await backend.removeSource('skill', 'skill-1');
    expect(repo.removeBySource).toHaveBeenCalledWith('skill', 'skill-1');

    await backend.rebuildProjection([trapDocument]);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.removeBySource).toHaveBeenCalledTimes(1);

    await expect(
      backend.expandSourcesOneHop({ queryLabels: new Set(['database-migration']) }),
    ).resolves.toEqual(new Set(['t1', 's1']));
    await expect(
      backend.calculateSourceRelationStrength({
        sourceId: 's1',
        queryLabels: new Set(['database-migration']),
      }),
    ).resolves.toBe(1);
    await expect(backend.getSourceNodeIds(['t1', 's1'])).resolves.toEqual(
      new Map([
        ['t1', new Set(['trap:t1', 'skill:s1'])],
        ['s1', new Set(['skill:s1'])],
      ]),
    );

    const expansionView = await backend.buildLocalExpansionView({
      seedNodeIds: ['skill:s1'],
      maxDepth: 1,
      auth: { teamId: null, securityLevel: 0 },
    });
    expect(expansionView.graph.nodes()).toEqual(expect.arrayContaining(['trap:t1', 'skill:s1']));
    expect(expansionView.nodeViewsById.get('trap:t1')?.sourceId).toBe('t1');
    expect(expansionView.nodeViewsById.get('skill:s1')?.sourceId).toBe('s1');
    expect(expansionView.nodeIdsBySourceId).toEqual(
      new Map([
        ['t1', new Set(['trap:t1'])],
        ['s1', new Set(['skill:s1'])],
      ]),
    );

    await expect(backend.findMitigatingSkills(['trap:t1'])).resolves.toEqual(['skill:s1']);
  });
});
