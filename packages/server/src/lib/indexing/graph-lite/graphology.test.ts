import { describe, expect, it } from 'vitest';
import {
  buildCycleDataset,
  buildDeployClusterDataset,
  buildDisconnectedDataset,
} from '../../retrieval/__fixtures__/graph-fixtures.js';
import type { GraphEdgeRecord, GraphIndexDocumentRecord, GraphNodeRecord } from './documents.js';
import {
  assertNoHardDependencyCycles,
  buildGraphFromDocuments,
  buildGraphRuntimeSnapshot,
  buildLocalExpansionView,
  calculateSourceRelationStrength,
  expandSourcesOneHop,
  findEntriesByContext,
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

describe('boundary node back-references', () => {
  it('supports reverse lookup from boundary node to source entries', () => {
    // Build documents with boundary nodes
    const doc1: GraphIndexDocumentRecord = {
      id: 'graphdoc_trap_entry1_r1',
      sourceType: 'trap',
      sourceId: 'entry1',
      revision: 1,
      contentHash: 'hash1',
      teamId: null,
      scope: 'global',
      requiredLevel: 0,
      nodes: [
        { id: 'trap:entry1', kind: 'trap', label: 'Entry 1', evidence: 'test' },
        {
          id: 'boundary-context:frontend',
          kind: 'boundary-context',
          label: 'frontend',
          evidence: 'context',
        },
      ],
      edges: [
        {
          id: 'trap:entry1->boundary-context:frontend:applies-in',
          sourceNodeId: 'trap:entry1',
          targetNodeId: 'boundary-context:frontend',
          relationType: 'applies-in',
          strength: 'soft',
          evidence: 'test',
        },
      ],
      evidence: 'test',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const doc2: GraphIndexDocumentRecord = {
      id: 'graphdoc_trap_entry2_r1',
      sourceType: 'trap',
      sourceId: 'entry2',
      revision: 1,
      contentHash: 'hash2',
      teamId: null,
      scope: 'global',
      requiredLevel: 0,
      nodes: [
        { id: 'trap:entry2', kind: 'trap', label: 'Entry 2', evidence: 'test' },
        {
          id: 'boundary-context:frontend',
          kind: 'boundary-context',
          label: 'frontend',
          evidence: 'context',
        },
      ],
      edges: [
        {
          id: 'trap:entry2->boundary-context:frontend:applies-in',
          sourceNodeId: 'trap:entry2',
          targetNodeId: 'boundary-context:frontend',
          relationType: 'applies-in',
          strength: 'soft',
          evidence: 'test',
        },
      ],
      evidence: 'test',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const runtime = buildGraphRuntimeSnapshot([doc1, doc2]);

    // Find all entries applicable in "frontend" context
    const frontendNodeSources = runtime.sourceIdsByNodeId.get('boundary-context:frontend');

    expect(frontendNodeSources).toBeInstanceOf(Set);
    expect(frontendNodeSources?.has('entry1')).toBe(true);
    expect(frontendNodeSources?.has('entry2')).toBe(true);
    expect(frontendNodeSources?.size).toBe(2);
  });

  it('supports lookup by normalized label for boundary nodes', () => {
    const doc: GraphIndexDocumentRecord = {
      id: 'graphdoc_trap_entry1_r1',
      sourceType: 'trap',
      sourceId: 'entry1',
      revision: 1,
      contentHash: 'hash1',
      teamId: null,
      scope: 'global',
      requiredLevel: 0,
      nodes: [
        { id: 'trap:entry1', kind: 'trap', label: 'Entry 1', evidence: 'test' },
        {
          id: 'boundary-version:react@>=16.8.0',
          kind: 'boundary-version',
          label: 'react@>=16.8.0',
          evidence: 'version',
        },
      ],
      edges: [],
      evidence: 'test',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const runtime = buildGraphRuntimeSnapshot([doc]);

    // Lookup by normalized label should find the node
    const sources = runtime.sourceIdsByNormalizedLabel.get('react@>=16.8.0');
    expect(sources?.has('entry1')).toBe(true);
  });

  it('findEntriesByContext returns correct entries', () => {
    const doc: GraphIndexDocumentRecord = {
      id: 'graphdoc_trap_entry1_r1',
      sourceType: 'trap',
      sourceId: 'entry1',
      revision: 1,
      contentHash: 'hash1',
      teamId: null,
      scope: 'global',
      requiredLevel: 0,
      nodes: [
        { id: 'trap:entry1', kind: 'trap', label: 'Entry 1', evidence: 'test' },
        {
          id: 'boundary-context:production',
          kind: 'boundary-context',
          label: 'production',
          evidence: 'context',
        },
      ],
      edges: [
        {
          id: 'trap:entry1->boundary-context:production:applies-in',
          sourceNodeId: 'trap:entry1',
          targetNodeId: 'boundary-context:production',
          relationType: 'applies-in',
          strength: 'soft',
          evidence: 'test',
        },
      ],
      evidence: 'test',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const runtime = buildGraphRuntimeSnapshot([doc]);
    const result = findEntriesByContext(runtime, 'production');

    expect(result.has('entry1')).toBe(true);
    expect(result.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 1A: Expanded graph orchestration tests (large-scale fixtures)
// ---------------------------------------------------------------------------

describe('graph-lite/graphology — large-scale fixtures', () => {
  describe('buildGraphFromDocuments -- large graph (25+ nodes)', () => {
    it('assembles the full Deploy Cluster dataset into a connected graph', () => {
      const dataset = buildDeployClusterDataset();
      const graph = buildGraphFromDocuments(dataset.graphDocs);

      // All trap nodes present
      for (const node of dataset.trapNodes) {
        expect(graph.hasNode(node.id), `trap node ${node.id}`).toBe(true);
      }

      // All skill nodes present
      for (const node of dataset.skillNodes) {
        expect(graph.hasNode(node.id), `skill node ${node.id}`).toBe(true);
      }

      // All cue nodes present
      for (const node of dataset.cueNodes) {
        expect(graph.hasNode(node.id), `cue node ${node.id}`).toBe(true);
      }

      // Total nodes should be 25+ (8 trap + 10 skill + 4 cue + 3 prereq)
      expect(graph.nodes().length).toBeGreaterThanOrEqual(25);

      // Mitigates edges should exist
      const mitigatesEdges = dataset.edges.filter((e) => e.relationType === 'mitigates');
      for (const edge of mitigatesEdges) {
        expect(graph.hasEdge(edge.id), `mitigates edge ${edge.id}`).toBe(true);
      }
    });
  });

  describe('projectHardDependencyGraph on 25+ nodes', () => {
    it('retains only hard requires and hard risk-blocks, filters soft edges', () => {
      const dataset = buildDeployClusterDataset();
      const hardGraph = projectHardDependencyGraph(dataset.graphDocs);

      // Hard requires edges should exist
      const hardRequires = dataset.edges.filter(
        (e) => e.relationType === 'requires' && e.strength === 'hard',
      );
      for (const edge of hardRequires) {
        expect(hardGraph.hasEdge(edge.id), `hard requires ${edge.id}`).toBe(true);
      }

      // Hard risk-blocks edges should exist
      const hardRiskBlocks = dataset.edges.filter(
        (e) => e.relationType === 'risk-blocks' && e.strength === 'hard',
      );
      for (const edge of hardRiskBlocks) {
        expect(hardGraph.hasEdge(edge.id), `hard risk-blocks ${edge.id}`).toBe(true);
      }

      // Soft edges should be filtered out
      const softEdges = dataset.edges.filter(
        (e) =>
          e.strength === 'soft' &&
          (e.relationType === 'order' ||
            e.relationType === 'co-occurs-with' ||
            e.relationType === 'applies-in'),
      );
      for (const edge of softEdges) {
        expect(hardGraph.hasEdge(edge.id), `soft edge ${edge.id} should be filtered`).toBe(false);
      }
    });
  });

  describe('buildLocalExpansionView multi-hop', () => {
    it('expands from seed to 2-hop reachable skills in Deploy Cluster', () => {
      const dataset = buildDeployClusterDataset();

      // Seed from skill:k8s-rolling-update which has:
      // - mitigates edge TO trap:mem-leak-rollback (outgoing)
      // - requires edges FROM skill:blue-green-deploy and skill:canary-release (incoming)
      // - co-occurs-with edges to skill:container-health-check
      const localView = buildLocalExpansionView({
        documents: dataset.graphDocs,
        seedNodeIds: ['skill:k8s-rolling-update'],
        maxDepth: 2,
      });

      // Seed is always included
      expect(localView.hasNode('skill:k8s-rolling-update')).toBe(true);

      // 1 hop via outgoing mitigates edge: trap:mem-leak-rollback
      expect(localView.hasNode('trap:mem-leak-rollback')).toBe(true);

      // 1 hop via co-occurs-with: skill:container-health-check
      expect(localView.hasNode('skill:container-health-check')).toBe(true);

      // Beyond maxDepth: skills requiring k8s-rolling-update would be at 2+ hops
      // depending on edge direction (requires edges point TO k8s-rolling-update, not FROM it)
    });
  });

  describe('buildGraphFromDocuments -- disconnected components', () => {
    it('isolates nodes from different components', () => {
      const { docs, isolatedNodeIds, clusterANodeIds, clusterBNodeIds } =
        buildDisconnectedDataset();
      const graph = buildGraphFromDocuments(docs);

      // All nodes should exist in the graph
      for (const id of [...isolatedNodeIds, ...clusterANodeIds, ...clusterBNodeIds]) {
        expect(graph.hasNode(id), `node ${id} should exist`).toBe(true);
      }

      // Isolated nodes should have no edges
      for (const id of isolatedNodeIds) {
        expect(graph.degree(id), `isolated node ${id} degree`).toBe(0);
      }

      // Cluster A and B should be connected internally
      const clusterAAtraps = clusterANodeIds.filter((id) => id.startsWith('trap:'));
      for (const trapId of clusterAAtraps) {
        expect(graph.degree(trapId), `cluster A trap ${trapId} degree`).toBeGreaterThan(0);
      }
    });
  });

  describe('expandSourcesOneHop cross-component isolation', () => {
    it('Cluster-A nodes do not return Cluster-B sources', () => {
      const {
        docs,
        clusterANodeIds: _clusterANodeIds,
        clusterBNodeIds: _clusterBNodeIds,
      } = buildDisconnectedDataset();
      const runtime = buildGraphRuntimeSnapshot(docs);

      // Expand from a label unique to Cluster A (normalized form)
      // Note: expandSourcesOneHop doesn't normalize the input label,
      // so we pass the already-normalized form
      const expanded = expandSourcesOneHop(runtime, new Set(['cluster-a-trap']));

      // Should find Cluster A sources (the sourceId for the trap document is 'cluster-a-trap')
      expect(expanded.has('cluster-a-trap')).toBe(true);

      // Should NOT find Cluster B sources
      expect(expanded.has('cluster-b-trap')).toBe(false);
      expect(expanded.has('cluster-b-skill')).toBe(false);
    });
  });

  describe('buildGraphFromDocuments -- empty/degenerate', () => {
    it('handles empty documents array', () => {
      const graph = buildGraphFromDocuments([]);
      expect(graph.nodes().length).toBe(0);
      expect(graph.edges().length).toBe(0);
    });

    it('handles documents with empty nodes', () => {
      const doc = makeDoc('doc1', 'trap', 'entry-1', 1, [], []);
      const graph = buildGraphFromDocuments([doc]);
      expect(graph.nodes().length).toBe(0);
    });

    it('handles edges referencing non-existent nodes gracefully', () => {
      const edges: GraphEdgeRecord[] = [
        {
          id: 'orphan-edge',
          sourceNodeId: 'trap:nonexistent',
          targetNodeId: 'skill:also-missing',
          relationType: 'mitigates',
          strength: 'hard',
          evidence: 'orphan',
        },
      ];
      const nodes: GraphNodeRecord[] = [];
      const doc = makeDoc('doc-orphan', 'trap', 'entry-1', 1, nodes, edges);

      // Note: buildGraphFromDocuments calls mergeNode for source/target,
      // which creates the nodes if they don't exist. This is by design.
      const graph = buildGraphFromDocuments([doc]);

      // The nodes are auto-created by mergeNode calls
      expect(graph.hasNode('trap:nonexistent')).toBe(true);
      expect(graph.hasNode('skill:also-missing')).toBe(true);

      // The edge is also created (mergeNode ensures nodes exist first)
      expect(graph.edges().length).toBe(1);
      expect(graph.hasEdge('orphan-edge')).toBe(true);
    });
  });

  describe('assertNoHardDependencyCycles -- mixed strength', () => {
    it('soft-edge cycle should pass (not treated as hard)', () => {
      const { mixedCycleDoc } = buildCycleDataset();

      // Mixed cycle: 2 hard + 1 soft edge. Only hard edges are checked.
      // The soft edge completes the cycle but shouldn't trigger the assertion.
      // However, assertNoHardDependencyCycles checks hard-only projection.
      // With 2 hard requires (a->b, b->c) but c->a is soft, no hard cycle exists.
      expect(() => assertNoHardDependencyCycles([mixedCycleDoc])).not.toThrow();
    });

    it('hard-edge cycle should throw', () => {
      const { hardCycleDoc } = buildCycleDataset();
      expect(() => assertNoHardDependencyCycles([hardCycleDoc])).toThrow(
        'hard dependency cycle detected',
      );
    });
  });

  describe('assertNoHardDependencyCycles -- large cycle', () => {
    it('detects a 5-node hard dependency cycle', () => {
      const nodes = Array.from({ length: 5 }, (_, i) => ({
        id: `skill:n${i}`,
        kind: 'skill' as const,
        label: `Node ${i}`,
        evidence: 'test',
      }));
      const edges: GraphEdgeRecord[] = [];
      for (let i = 0; i < 5; i++) {
        const next = (i + 1) % 5;
        edges.push({
          id: `n${i}->n${next}:requires`,
          sourceNodeId: `skill:n${i}`,
          targetNodeId: `skill:n${next}`,
          relationType: 'requires',
          strength: 'hard',
          evidence: 'test',
        });
      }
      const doc = makeDoc('doc-5cycle', 'skill', 'art-1', 1, nodes, edges);

      expect(() => assertNoHardDependencyCycles([doc])).toThrow('hard dependency cycle detected');
    });
  });

  describe('assertNoHardDependencyCycles -- diamond (A→B,C→D)', () => {
    it('diamond dependency should pass (no cycle)', () => {
      const { diamondDoc } = buildCycleDataset();
      expect(() => assertNoHardDependencyCycles([diamondDoc])).not.toThrow();
    });
  });
});
