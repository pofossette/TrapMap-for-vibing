import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import { describe, expect, it } from 'vitest';
import { buildTrapGraphDocument } from './graph-builders.js';
import type { TrapGraphDocumentBuilderInput } from './graph-builders.js';

function makeNormalizedDoc(entryId: string): NormalizedIndexDocument {
  return {
    entryId,
    revision: 1,
    teamId: null,
    scope: 'global' as const,
    requiredLevel: 0,
    lifecycleState: 'approved' as const,
    updatedAt: '2026-01-01T00:00:00Z',
    shortcut: `Shortcut for ${entryId}`,
    detail: `Detail for ${entryId}`,
    labels: [],
    canonicalText: '',
    tokens: [],
    contentHash: '',
    normalizedAt: '2026-01-01T00:00:00Z',
    boundary: null,
  };
}

function makeInput(
  overrides: Partial<TrapGraphDocumentBuilderInput> = {},
): TrapGraphDocumentBuilderInput {
  return {
    normalizedDocument: makeNormalizedDoc('entry-1'),
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe('buildTrapGraphDocument', () => {
  describe('severity pre-computation', () => {
    it('sets severity=hard for trap node with hard risk-blocks edge', () => {
      const input = makeInput({
        nodes: [{ id: 'trap:block-hard', kind: 'trap', label: 'Hard trap', evidence: 'ev' }],
        edges: [
          {
            relationType: 'risk-blocks',
            sourceNodeId: 'trap:block-hard',
            targetNodeId: 'cue:x',
            strength: 'hard',
            evidence: 'ev',
          },
        ],
      });

      const result = buildTrapGraphDocument(input);

      const trapNode = result.nodes.find((n) => n.kind === 'trap');
      expect(trapNode).toBeDefined();
      expect(trapNode!.severity).toBe('hard');
    });

    it('sets severity=soft for trap node with only soft risk-blocks edge', () => {
      const input = makeInput({
        nodes: [
          { id: 'trap:block-soft', kind: 'trap', label: 'Soft trap', evidence: 'ev' },
          { id: 'cue:y', kind: 'cue', label: 'Cue', evidence: 'ev' },
        ],
        edges: [
          {
            relationType: 'risk-blocks',
            sourceNodeId: 'trap:block-soft',
            targetNodeId: 'cue:y',
            strength: 'soft',
            evidence: 'ev',
          },
        ],
      });

      const result = buildTrapGraphDocument(input);

      const trapNode = result.nodes.find((n) => n.kind === 'trap');
      expect(trapNode).toBeDefined();
      expect(trapNode!.severity).toBe('soft');
    });

    it('sets severity=soft for trap node with no risk-blocks edge', () => {
      const input = makeInput({
        nodes: [{ id: 'trap:no-risk', kind: 'trap', label: 'No-risk trap', evidence: 'ev' }],
        edges: [],
      });

      const result = buildTrapGraphDocument(input);

      const trapNode = result.nodes.find((n) => n.kind === 'trap');
      expect(trapNode).toBeDefined();
      expect(trapNode!.severity).toBe('soft');
    });

    it('does not set severity on non-trap nodes', () => {
      const input = makeInput({
        nodes: [
          { id: 'skill:s1', kind: 'skill', label: 'Skill', evidence: 'ev' },
          { id: 'cue:c1', kind: 'cue', label: 'Cue', evidence: 'ev' },
          { id: 'tool:t1', kind: 'tool', label: 'Tool', evidence: 'ev' },
          { id: 'mitigation:m1', kind: 'mitigation', label: 'Mitigation', evidence: 'ev' },
        ],
        edges: [],
      });

      const result = buildTrapGraphDocument(input);

      for (const node of result.nodes) {
        expect(node.severity).toBeUndefined();
      }
    });
  });

  describe('mitigates pre-computation', () => {
    it('sets mitigates with the target trap ID when skill node has a single mitigates edge', () => {
      const trapId = 'trap:target-1';
      const skillId = 'skill:s1';
      const input = makeInput({
        nodes: [
          { id: skillId, kind: 'skill', label: 'Mitigating skill', evidence: 'ev' },
          { id: trapId, kind: 'trap', label: 'Target trap', evidence: 'ev' },
        ],
        edges: [
          {
            relationType: 'mitigates',
            sourceNodeId: skillId,
            targetNodeId: trapId,
            strength: 'hard',
            evidence: 'ev',
          },
        ],
      });

      const result = buildTrapGraphDocument(input);

      const skillNode = result.nodes.find((n) => n.id === skillId);
      expect(skillNode).toBeDefined();
      expect(skillNode!.mitigates).toEqual([trapId]);
    });

    it('sets mitigates with all trap IDs when skill node has multiple mitigates edges', () => {
      const trap1 = 'trap:target-1';
      const trap2 = 'trap:target-2';
      const trap3 = 'trap:target-3';
      const skillId = 'skill:multi';
      const input = makeInput({
        nodes: [
          { id: skillId, kind: 'skill', label: 'Multi-mitigates skill', evidence: 'ev' },
          { id: trap1, kind: 'trap', label: 'Trap 1', evidence: 'ev' },
          { id: trap2, kind: 'trap', label: 'Trap 2', evidence: 'ev' },
          { id: trap3, kind: 'trap', label: 'Trap 3', evidence: 'ev' },
        ],
        edges: [
          {
            relationType: 'mitigates',
            sourceNodeId: skillId,
            targetNodeId: trap1,
            strength: 'hard',
            evidence: 'ev',
          },
          {
            relationType: 'mitigates',
            sourceNodeId: skillId,
            targetNodeId: trap2,
            strength: 'hard',
            evidence: 'ev',
          },
          {
            relationType: 'mitigates',
            sourceNodeId: skillId,
            targetNodeId: trap3,
            strength: 'soft',
            evidence: 'ev',
          },
        ],
      });

      const result = buildTrapGraphDocument(input);

      const skillNode = result.nodes.find((n) => n.id === skillId);
      expect(skillNode).toBeDefined();
      expect(skillNode!.mitigates).toEqual([trap1, trap2, trap3]);
    });

    it('leaves mitigates undefined when skill node has no mitigates edges', () => {
      const skillId = 'skill:no-mit';
      const input = makeInput({
        nodes: [{ id: skillId, kind: 'skill', label: 'Non-mitigating skill', evidence: 'ev' }],
        edges: [],
      });

      const result = buildTrapGraphDocument(input);

      const skillNode = result.nodes.find((n) => n.id === skillId);
      expect(skillNode).toBeDefined();
      expect(skillNode!.mitigates).toBeUndefined();
    });
  });
});
