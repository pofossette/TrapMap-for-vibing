import { describe, expect, it } from 'vitest';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
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
        nodes: [
          { id: 'trap:block-hard', kind: 'trap', label: 'Hard trap', evidence: 'ev' },
        ],
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
        nodes: [
          { id: 'trap:no-risk', kind: 'trap', label: 'No-risk trap', evidence: 'ev' },
        ],
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
});
