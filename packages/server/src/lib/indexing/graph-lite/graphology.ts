/**
 * Graphology assembly, hard-edge projection, cycle validation, and
 * bounded expansion helpers for the GraphRAG-lite indexing layer.
 *
 * These helpers operate on persisted GraphIndexDocumentRecord arrays
 * and produce graphology graph instances for validation and query-time use.
 */

import Graph from 'graphology';
import { hasCycle } from 'graphology-dag';
import { subgraph } from 'graphology-operators';
import { singleSourceLength } from 'graphology-shortest-path';

import type { GraphEdgeRecord, GraphIndexDocumentRecord } from './documents.js';

// ---------------------------------------------------------------------------
// Graph assembly
// ---------------------------------------------------------------------------

/**
 * Assemble a graphology directed graph from an array of graph documents.
 *
 * Nodes are keyed by their node id with kind/label attributes.
 * Edges are keyed by their edge id with relationType/strength attributes.
 */
export function buildGraphFromDocuments(documents: GraphIndexDocumentRecord[]): Graph {
  const graph = new Graph({ type: 'directed', multi: true });

  for (const doc of documents) {
    for (const node of doc.nodes) {
      graph.mergeNode(node.id, { kind: node.kind, label: node.label });
    }
    for (const edge of doc.edges) {
      // Ensure source and target nodes exist before adding edge
      graph.mergeNode(edge.sourceNodeId);
      graph.mergeNode(edge.targetNodeId);
      graph.mergeEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, {
        relationType: edge.relationType,
        strength: edge.strength,
      });
    }
  }

  return graph;
}

function normalizeGraphLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '-');
}

function edgeWeight(strength: GraphEdgeRecord['strength']): number {
  return strength === 'hard' ? 2 : 1;
}

export interface GraphRuntimeSnapshot {
  graph: Graph;
  documentsBySourceId: Map<string, GraphIndexDocumentRecord>;
  nodeIdsByNormalizedLabel: Map<string, Set<string>>;
  sourceIdsByNormalizedLabel: Map<string, Set<string>>;
  sourceIdsByNodeId: Map<string, Set<string>>;
  nodeIdsBySourceId: Map<string, Set<string>>;
}

export function buildGraphRuntimeSnapshot(
  documents: GraphIndexDocumentRecord[],
): GraphRuntimeSnapshot {
  const graph = buildGraphFromDocuments(documents);
  const documentsBySourceId = new Map<string, GraphIndexDocumentRecord>();
  const nodeIdsByNormalizedLabel = new Map<string, Set<string>>();
  const sourceIdsByNormalizedLabel = new Map<string, Set<string>>();
  const sourceIdsByNodeId = new Map<string, Set<string>>();
  const nodeIdsBySourceId = new Map<string, Set<string>>();

  for (const doc of documents) {
    documentsBySourceId.set(doc.sourceId, doc);

    if (!nodeIdsBySourceId.has(doc.sourceId)) {
      nodeIdsBySourceId.set(doc.sourceId, new Set());
    }

    for (const node of doc.nodes) {
      const normalizedLabel = normalizeGraphLabel(node.label);

      if (!nodeIdsByNormalizedLabel.has(normalizedLabel)) {
        nodeIdsByNormalizedLabel.set(normalizedLabel, new Set());
      }
      nodeIdsByNormalizedLabel.get(normalizedLabel)?.add(node.id);

      if (!sourceIdsByNormalizedLabel.has(normalizedLabel)) {
        sourceIdsByNormalizedLabel.set(normalizedLabel, new Set());
      }
      sourceIdsByNormalizedLabel.get(normalizedLabel)?.add(doc.sourceId);

      if (!sourceIdsByNodeId.has(node.id)) {
        sourceIdsByNodeId.set(node.id, new Set());
      }
      sourceIdsByNodeId.get(node.id)?.add(doc.sourceId);

      nodeIdsBySourceId.get(doc.sourceId)?.add(node.id);
    }
  }

  return {
    graph,
    documentsBySourceId,
    nodeIdsByNormalizedLabel,
    sourceIdsByNormalizedLabel,
    sourceIdsByNodeId,
    nodeIdsBySourceId,
  };
}

export function expandSourcesOneHop(
  runtime: GraphRuntimeSnapshot,
  queryLabels: Set<string>,
): Set<string> {
  const candidateSourceIds = new Set<string>();
  const seedNodeIds = new Set<string>();

  for (const label of queryLabels) {
    for (const sourceId of runtime.sourceIdsByNormalizedLabel.get(label) ?? []) {
      candidateSourceIds.add(sourceId);
    }

    for (const nodeId of runtime.nodeIdsByNormalizedLabel.get(label) ?? []) {
      seedNodeIds.add(nodeId);
    }
  }

  for (const seedNodeId of seedNodeIds) {
    for (const neighborNodeId of runtime.graph.neighbors(seedNodeId)) {
      for (const sourceId of runtime.sourceIdsByNodeId.get(neighborNodeId) ?? []) {
        candidateSourceIds.add(sourceId);
      }
    }
  }

  return candidateSourceIds;
}

export function calculateSourceRelationStrength(
  runtime: GraphRuntimeSnapshot,
  sourceId: string,
  queryLabels: Set<string>,
): number {
  const sourceNodeIds = runtime.nodeIdsBySourceId.get(sourceId);
  if (!sourceNodeIds || sourceNodeIds.size === 0) {
    return 0;
  }

  const queryNodeIds = new Set<string>();
  for (const label of queryLabels) {
    for (const nodeId of runtime.nodeIdsByNormalizedLabel.get(label) ?? []) {
      queryNodeIds.add(nodeId);
    }
  }

  if (queryNodeIds.size === 0) {
    return 0;
  }

  let strength = 0;
  const countedEdgeIds = new Set<string>();

  for (const nodeId of sourceNodeIds) {
    if (!runtime.graph.hasNode(nodeId)) {
      continue;
    }

    for (const edgeId of runtime.graph.edges(nodeId)) {
      if (countedEdgeIds.has(edgeId)) {
        continue;
      }

      const [sourceNodeId, targetNodeId] = runtime.graph.extremities(edgeId);
      if (!sourceNodeId || !targetNodeId) {
        continue;
      }
      if (!queryNodeIds.has(sourceNodeId) && !queryNodeIds.has(targetNodeId)) {
        continue;
      }

      countedEdgeIds.add(edgeId);
      const attributes = runtime.graph.getEdgeAttributes(edgeId) as { strength?: GraphEdgeRecord['strength'] };
      strength += edgeWeight(attributes.strength ?? 'soft');
    }
  }

  return strength;
}

// ---------------------------------------------------------------------------
// Hard-edge projection
// ---------------------------------------------------------------------------

/**
 * Hard relation types that participate in the DAG projection.
 * Only 'requires' and 'risk-blocks' edges with strength 'hard' are included.
 * 'order' and 'co-occurs-with' must stay out of the DAG projection (D-05).
 */
const HARD_RELATION_TYPES: ReadonlySet<string> = new Set(['requires', 'risk-blocks']);

/**
 * Project only hard dependency edges from documents into a directed graph.
 *
 * Includes only edges where:
 * - relationType is 'requires' or 'risk-blocks' (hard relation types)
 * - strength is 'hard'
 *
 * Excludes 'order', 'co-occurs-with', and soft edges from the DAG.
 */
export function projectHardDependencyGraph(documents: GraphIndexDocumentRecord[]): Graph {
  const dag = new Graph({ type: 'directed', multi: true });

  for (const doc of documents) {
    for (const edge of doc.edges) {
      if (HARD_RELATION_TYPES.has(edge.relationType) && edge.strength === 'hard') {
        dag.mergeNode(edge.sourceNodeId);
        dag.mergeNode(edge.targetNodeId);
        dag.mergeEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, {
          relationType: edge.relationType,
          strength: edge.strength,
        });
      }
    }
  }

  return dag;
}

// ---------------------------------------------------------------------------
// Cycle validation
// ---------------------------------------------------------------------------

/**
 * Assert that the hard dependency graph has no cycles.
 *
 * Throws with deterministic error text 'hard dependency cycle detected'
 * when a cycle exists in the hard-edge projection.
 */
export function assertNoHardDependencyCycles(documents: GraphIndexDocumentRecord[]): void {
  const dag = projectHardDependencyGraph(documents);
  if (hasCycle(dag)) {
    throw new Error('hard dependency cycle detected');
  }
}

// ---------------------------------------------------------------------------
// Bounded local expansion
// ---------------------------------------------------------------------------

/**
 * Parameters for building a bounded local expansion view.
 */
export interface LocalExpansionParams {
  /** Graph documents to assemble and expand from */
  documents: GraphIndexDocumentRecord[];
  /** Seed node ids to start expansion from */
  seedNodeIds: string[];
  /** Maximum depth (in hops) to expand from seeds */
  maxDepth: number;
}

/**
 * Build a bounded local expansion view around seed nodes.
 *
 * Returns a subgraph containing:
 * 1. All seed nodes (even if they have no edges)
 * 2. All nodes reachable within maxDepth hops from any seed node
 *
 * Uses graphology-shortest-path singleSourceLength for efficient
 * breadth-bounded reachability.
 */
export function buildLocalExpansionView(params: LocalExpansionParams): Graph {
  const { documents, seedNodeIds, maxDepth } = params;
  const graph = buildGraphFromDocuments(documents);

  const reachableNodeIds = new Set<string>();

  for (const seedId of seedNodeIds) {
    // Always include seed nodes even if not in graph
    if (graph.hasNode(seedId)) {
      reachableNodeIds.add(seedId);
    } else {
      continue;
    }

    // Get shortest path lengths from this seed
    const distances = singleSourceLength(graph, seedId);

    for (const [nodeId, distance] of Object.entries(distances)) {
      if (distance !== null && distance <= maxDepth) {
        reachableNodeIds.add(nodeId);
      }
    }
  }

  // Return subgraph containing only reachable nodes
  return subgraph(graph, reachableNodeIds);
}
