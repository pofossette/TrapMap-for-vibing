import { describe, expect, it } from 'vitest';
import type { GraphEdgeRecord, GraphIndexDocumentRecord, GraphNodeRecord } from './documents.js';
import {
  assertNoHardDependencyCycles,
  buildGraphFromDocuments,
  buildGraphRuntimeSnapshot,
  buildLocalExpansionView,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
  projectHardDependencyGraph,
} from './graphology.js';

function makeDoc(
  id: string,
  sourceType: 'trap' | 'skill',
  sourceId: string,
  revision: number,
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
): GraphIndexDocumentRecord {
  return {
    id,
    sourceType,
    sourceId,
    revision,
    contentHash: `hash-${id}`,
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    nodes,
    edges,
    evidence: 'test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('graph-lite/graphology', () => {
  describe('buildGraphFromDocuments', () => {
    it('assembles multiple graph documents into stable graphology node and edge keys', () => {
      const nodes1: GraphNodeRecord[] = [
        { id: 'trap:entry-1', kind: 'trap', label: 'corruption', evidence: 'test' },
      ];
      const edges1: GraphEdgeRecord[] = [];

      const nodes2: GraphNodeRecord[] = [
        { id: 'skill:art-1', kind: 'skill', label: 'cleanup', evidence: 'test' },
      ];
      const edges2: GraphEdgeRecord[] = [
        {
          id: 'trap:entry-1->skill:art-1:mitigates',
          sourceNodeId: 'trap:entry-1',
          targetNodeId: 'skill:art-1',
          relationType: 'mitigates',
          strength: 'hard',
          evidence: 'test',
        },
      ];

      const doc1 = makeDoc('doc1', 'trap', 'entry-1', 1, nodes1, edges1);
      const doc2 = makeDoc('doc2', 'skill', 'art-1', 1, nodes2, edges2);

      const graph = buildGraphFromDocuments([doc1, doc2]);

      // Nodes are keyed by node id
      expect(graph.hasNode('trap:entry-1')).toBe(true);
      expect(graph.hasNode('skill:art-1')).toBe(true);

      // Edge key includes source, target, and relation
      expect(graph.hasEdge('trap:entry-1->skill:art-1:mitigates')).toBe(true);

      // Node attributes include kind and label
      expect(graph.getNodeAttribute('trap:entry-1', 'kind')).toBe('trap');
      expect(graph.getNodeAttribute('trap:entry-1', 'label')).toBe('corruption');

      // Edge attributes include relation type and strength
      const edgeAttrs = graph.getEdgeAttributes('trap:entry-1->skill:art-1:mitigates');
      expect(edgeAttrs.relationType).toBe('mitigates');
      expect(edgeAttrs.strength).toBe('hard');
    });
  });

  describe('projectHardDependencyGraph', () => {
    it('projects only hard requires and hard risk-blocks edges', () => {
      const nodes: GraphNodeRecord[] = [
        { id: 'skill:a', kind: 'skill', label: 'A', evidence: 'test' },
        { id: 'skill:b', kind: 'skill', label: 'B', evidence: 'test' },
        { id: 'skill:c', kind: 'skill', label: 'C', evidence: 'test' },
        { id: 'skill:d', kind: 'skill', label: 'D', evidence: 'test' },
      ];
      const edges: GraphEdgeRecord[] = [
        {
          id: 'a->b:requires',
          sourceNodeId: 'skill:a',
          targetNodeId: 'skill:b',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'hard dependency',
        },
        {
          id: 'b->c:risk-blocks',
          sourceNodeId: 'skill:b',
          targetNodeId: 'skill:c',
          relationType: 'risk-blocks',
          strength: 'hard',
          evidence: 'hard risk blocker',
        },
        {
          id: 'c->d:order',
          sourceNodeId: 'skill:c',
          targetNodeId: 'skill:d',
          relationType: 'order',
          strength: 'soft',
          evidence: 'soft precedence',
        },
        {
          id: 'a->d:mitigates',
          sourceNodeId: 'skill:a',
          targetNodeId: 'skill:d',
          relationType: 'mitigates',
          strength: 'soft',
          evidence: 'soft mitigation',
        },
        {
          id: 'b->d:co-occurs-with',
          sourceNodeId: 'skill:b',
          targetNodeId: 'skill:d',
          relationType: 'co-occurs-with',
          strength: 'soft',
          evidence: 'soft co-occurrence',
        },
      ];

      const doc = makeDoc('doc', 'skill', 'art-1', 1, nodes, edges);
      const hardGraph = projectHardDependencyGraph([doc]);

      // Only hard requires and hard risk-blocks should be in the DAG
      expect(hardGraph.hasEdge('a->b:requires')).toBe(true);
      expect(hardGraph.hasEdge('b->c:risk-blocks')).toBe(true);
      expect(hardGraph.hasEdge('c->d:order')).toBe(false);
      expect(hardGraph.hasEdge('a->d:mitigates')).toBe(false);
      expect(hardGraph.hasEdge('b->d:co-occurs-with')).toBe(false);
    });
  });

  describe('assertNoHardDependencyCycles', () => {
    it('throws with deterministic error text when a cycle exists', () => {
      const nodes: GraphNodeRecord[] = [
        { id: 'skill:a', kind: 'skill', label: 'A', evidence: 'test' },
        { id: 'skill:b', kind: 'skill', label: 'B', evidence: 'test' },
        { id: 'skill:c', kind: 'skill', label: 'C', evidence: 'test' },
      ];
      const edges: GraphEdgeRecord[] = [
        {
          id: 'a->b:requires',
          sourceNodeId: 'skill:a',
          targetNodeId: 'skill:b',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        },
        {
          id: 'b->c:requires',
          sourceNodeId: 'skill:b',
          targetNodeId: 'skill:c',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        },
        {
          id: 'c->a:requires',
          sourceNodeId: 'skill:c',
          targetNodeId: 'skill:a',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        },
      ];

      const doc = makeDoc('doc', 'skill', 'art-1', 1, nodes, edges);

      expect(() => assertNoHardDependencyCycles([doc])).toThrow('hard dependency cycle detected');
    });

    it('returns without error when no cycle exists', () => {
      const nodes: GraphNodeRecord[] = [
        { id: 'skill:a', kind: 'skill', label: 'A', evidence: 'test' },
        { id: 'skill:b', kind: 'skill', label: 'B', evidence: 'test' },
      ];
      const edges: GraphEdgeRecord[] = [
        {
          id: 'a->b:requires',
          sourceNodeId: 'skill:a',
          targetNodeId: 'skill:b',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        },
      ];

      const doc = makeDoc('doc', 'skill', 'art-1', 1, nodes, edges);

      // Should not throw
      expect(() => assertNoHardDependencyCycles([doc])).not.toThrow();
    });
  });

  describe('buildLocalExpansionView', () => {
    it('returns a subgraph limited to requested seed nodes and shortest-path reachable neighbors', () => {
      const nodes: GraphNodeRecord[] = [
        { id: 'trap:t1', kind: 'trap', label: 'T1', evidence: 'test' },
        { id: 'skill:s1', kind: 'skill', label: 'S1', evidence: 'test' },
        { id: 'skill:s2', kind: 'skill', label: 'S2', evidence: 'test' },
        { id: 'skill:s3', kind: 'skill', label: 'S3', evidence: 'test' },
        { id: 'cue:c1', kind: 'cue', label: 'C1', evidence: 'test' },
      ];
      const edges: GraphEdgeRecord[] = [
        {
          id: 't1->s1:mitigates',
          sourceNodeId: 'trap:t1',
          targetNodeId: 'skill:s1',
          relationType: 'mitigates',
          strength: 'hard',
          evidence: 'test',
        },
        {
          id: 's1->s2:requires',
          sourceNodeId: 'skill:s1',
          targetNodeId: 'skill:s2',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        },
        {
          id: 's2->s3:requires',
          sourceNodeId: 'skill:s2',
          targetNodeId: 'skill:s3',
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        },
        {
          id: 'c1->s3:order',
          sourceNodeId: 'cue:c1',
          targetNodeId: 'skill:s3',
          relationType: 'order',
          strength: 'soft',
          evidence: 'test',
        },
      ];

      const doc = makeDoc('doc', 'trap', 't1', 1, nodes, edges);

      // Request local expansion from trap:t1 with maxDepth 2
      const localView = buildLocalExpansionView({
        documents: [doc],
        seedNodeIds: ['trap:t1'],
        maxDepth: 2,
      });

      // trap:t1 is always included (seed)
      expect(localView.hasNode('trap:t1')).toBe(true);
      // s1 is 1 hop away
      expect(localView.hasNode('skill:s1')).toBe(true);
      // s2 is 2 hops away
      expect(localView.hasNode('skill:s2')).toBe(true);
      // s3 is 3 hops away, beyond maxDepth 2
      expect(localView.hasNode('skill:s3')).toBe(false);
      // c1 is not reachable from seed
      expect(localView.hasNode('cue:c1')).toBe(false);
    });
  });

  describe('buildGraphRuntimeSnapshot', () => {
    it('indexes labels, nodes, and source ownership for query-time expansion', () => {
      const doc1 = makeDoc(
        'doc1',
        'trap',
        'entry-1',
        1,
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' },
          { id: 'cue:timeout', kind: 'cue', label: 'timeout', evidence: 'test' },
        ],
        [],
      );
      const doc2 = makeDoc(
        'doc2',
        'trap',
        'entry-2',
        1,
        [
          { id: 'cue:timeout', kind: 'cue', label: 'timeout', evidence: 'test' },
          { id: 'mit:restart', kind: 'mitigation', label: 'restart', evidence: 'test' },
        ],
        [],
      );

      const runtime = buildGraphRuntimeSnapshot([doc1, doc2]);

      expect(runtime.nodeIdsByNormalizedLabel.get('timeout')).toEqual(new Set(['cue:timeout']));
      expect(runtime.sourceIdsByNormalizedLabel.get('timeout')).toEqual(
        new Set(['entry-1', 'entry-2']),
      );
      expect(runtime.sourceIdsByNodeId.get('cue:timeout')).toEqual(new Set(['entry-1', 'entry-2']));
    });
  });

  describe('expandSourcesOneHop', () => {
    it('returns direct and one-hop related sources from graphology neighbors', () => {
      const doc1 = makeDoc(
        'doc1',
        'trap',
        'entry-1',
        1,
        [{ id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' }],
        [],
      );
      const doc2 = makeDoc(
        'doc2',
        'trap',
        'entry-2',
        1,
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' },
          { id: 'cue:crash', kind: 'cue', label: 'crash', evidence: 'test' },
        ],
        [
          {
            id: 'docker->crash',
            sourceNodeId: 'tool:docker',
            targetNodeId: 'cue:crash',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'test',
          },
        ],
      );

      const runtime = buildGraphRuntimeSnapshot([doc1, doc2]);
      const expanded = expandSourcesOneHop(runtime, new Set(['docker']));

      expect(expanded).toEqual(new Set(['entry-1', 'entry-2']));
    });
  });

  describe('calculateSourceRelationStrength', () => {
    it('scores sources from graphology edge connectivity to query labels', () => {
      const doc = makeDoc(
        'doc',
        'trap',
        'entry-2',
        1,
        [
          { id: 'tool:docker', kind: 'tool', label: 'docker', evidence: 'test' },
          { id: 'cue:crash', kind: 'cue', label: 'crash', evidence: 'test' },
        ],
        [
          {
            id: 'docker->crash',
            sourceNodeId: 'tool:docker',
            targetNodeId: 'cue:crash',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'test',
          },
        ],
      );

      const runtime = buildGraphRuntimeSnapshot([doc]);

      expect(calculateSourceRelationStrength(runtime, 'entry-2', new Set(['docker']))).toBe(2);
      expect(calculateSourceRelationStrength(runtime, 'missing', new Set(['docker']))).toBe(0);
    });
  });
});
