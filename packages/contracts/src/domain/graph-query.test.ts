import {
  type GraphIndexDocumentRecord,
  assertNoHardDependencyCycles,
  buildGraphRuntimeSnapshot,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
} from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

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
  ],
  edges: [],
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
  nodes: [
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
      strength: 'hard',
      evidence: 'The skill mitigates the trap.',
    },
  ],
  evidence: 'Skill graph evidence.',
};

describe('graph query contract helpers', () => {
  it('expands related sources and weights hard relations', () => {
    const runtime = buildGraphRuntimeSnapshot([trapDocument, skillDocument]);

    expect(expandSourcesOneHop(runtime, new Set(['database-migration']))).toEqual(
      new Set(['t1', 's1']),
    );
    expect(calculateSourceRelationStrength(runtime, 's1', new Set(['database-migration']))).toBe(2);
  });

  it('rejects a hard dependency cycle with the deterministic message', () => {
    const cyclicDocument: GraphIndexDocumentRecord = {
      ...trapDocument,
      edges: [
        {
          id: 'edge:trap-requires-skill',
          sourceNodeId: 'trap:t1',
          targetNodeId: 'skill:s1',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'Trap requires skill.',
        },
        {
          id: 'edge:skill-requires-trap',
          sourceNodeId: 'skill:s1',
          targetNodeId: 'trap:t1',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'Skill requires trap.',
        },
      ],
    };

    expect(() => assertNoHardDependencyCycles([cyclicDocument])).toThrow(
      'hard dependency cycle detected',
    );
  });
});
