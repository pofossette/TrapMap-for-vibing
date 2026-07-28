/**
 * Graphology assembly, hard-edge projection, cycle validation, and
 * bounded expansion helpers for the GraphRAG-lite indexing layer.
 *
 * These helpers operate on persisted GraphIndexDocumentRecord arrays
 * and produce graphology graph instances for validation and query-time use.
 */

import Graphology from 'graphology';
import { hasCycle } from 'graphology-dag';
import { subgraph } from 'graphology-operators';
import { singleSourceLength } from 'graphology-shortest-path';

import { buildContextNodeId } from '@trapmap/server/lib/indexing/boundary-normalize.js';
import type { GraphEdgeRecord, GraphIndexDocumentRecord } from './documents.js';

type GraphNodeAttributes = {
  kind?: string;
  label?: string;
};

type GraphEdgeAttributes = {
  relationType?: string;
  strength?: GraphEdgeRecord['strength'];
};

export interface Graph {
  mergeNode(nodeId: string, attributes?: GraphNodeAttributes): void;
  mergeEdgeWithKey(
    edgeId: string,
    sourceNodeId: string,
    targetNodeId: string,
    attributes?: GraphEdgeAttributes,
  ): void;
  neighbors(nodeId: string): string[];
  hasNode(nodeId: string): boolean;
  edges(nodeId?: string): string[];
  extremities(edgeId: string): [string | undefined, string | undefined];
  getEdgeAttributes(edgeId: string): GraphEdgeAttributes;
  getNodeAttributes(nodeId: string): GraphNodeAttributes;
  nodes(): string[];
  forEachEdge(
    callback: (
      edgeKey: string,
      attributes: GraphEdgeAttributes,
      sourceNodeId: string,
      targetNodeId: string,
    ) => void,
  ): void;
  forEachEdge(
    nodeId: string,
    callback: (
      edgeKey: string,
      attributes: GraphEdgeAttributes,
      sourceNodeId: string,
      targetNodeId: string,
    ) => void,
  ): void;
}

const GraphCtor = Graphology as unknown as new (options?: {
  type?: string;
  multi?: boolean;
}) => Graph;

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
  const graph = new GraphCtor({ type: 'directed', multi: true });

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
  /** Reverse mitigation index: trapNodeId -> Set<skillNodeId> */
  mitigatingSkillNodeIdsByTrapNodeId: Map<string, Set<string>>;
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

  // Build mitigation reverse index
  const mitigatingSkillNodeIdsByTrapNodeId = new Map<string, Set<string>>();
  for (const doc of documents) {
    for (const edge of doc.edges) {
      if (edge.relationType === 'mitigates') {
        if (!mitigatingSkillNodeIdsByTrapNodeId.has(edge.targetNodeId)) {
          mitigatingSkillNodeIdsByTrapNodeId.set(edge.targetNodeId, new Set());
        }
        mitigatingSkillNodeIdsByTrapNodeId.get(edge.targetNodeId)!.add(edge.sourceNodeId);
      }
    }
  }

  return {
    graph,
    documentsBySourceId,
    nodeIdsByNormalizedLabel,
    sourceIdsByNormalizedLabel,
    sourceIdsByNodeId,
    nodeIdsBySourceId,
    mitigatingSkillNodeIdsByTrapNodeId,
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
      const attributes = runtime.graph.getEdgeAttributes(edgeId) as {
        strength?: GraphEdgeRecord['strength'];
      };
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
 * Only 'requires', 'risk-blocks', and 'requires-version' edges with strength 'hard' are included.
 * 'order', 'co-occurs-with', 'applies-in', 'excludes-context', and 'excludes-version' must stay out of the DAG projection (D-05).
 */
const HARD_RELATION_TYPES: ReadonlySet<string> = new Set([
  'requires',
  'risk-blocks',
  'requires-version', // Version requirements are hard dependencies
]);

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
  const dag = new GraphCtor({ type: 'directed', multi: true });

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
  if (hasCycle(dag as never)) {
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
    const distances = singleSourceLength(graph as never, seedId) as Record<string, number>;

    for (const [nodeId, distance] of Object.entries(distances)) {
      if (distance !== null && distance <= maxDepth) {
        reachableNodeIds.add(nodeId);
      }
    }
  }

  // Return subgraph containing only reachable nodes
  return subgraph(graph as never, reachableNodeIds) as Graph;
}

// ---------------------------------------------------------------------------
// Boundary query helpers
// ---------------------------------------------------------------------------

/**
 * Find all source entries that apply in a given context.
 *
 * @param runtime - The graph runtime snapshot
 * @param contextLabel - The context label to search for (e.g., 'frontend')
 * @returns Set of source entry IDs that apply in this context
 */
export function findEntriesByContext(
  runtime: GraphRuntimeSnapshot,
  contextLabel: string,
): Set<string> {
  const nodeId = buildContextNodeId(contextLabel);
  return runtime.sourceIdsByNodeId.get(nodeId) ?? new Set();
}

/**
 * Find all source entries that require a specific package.
 *
 * @param runtime - The graph runtime snapshot
 * @param packageName - The package name to search for (e.g., 'react')
 * @returns Set of source entry IDs that require this package
 */
function findEntriesByPackage(runtime: GraphRuntimeSnapshot, packageName: string): Set<string> {
  const normalizedPkg = packageName.toLowerCase();
  const result = new Set<string>();

  // Iterate over all boundary-version nodes for this package
  for (const [nodeId, sourceIds] of runtime.sourceIdsByNodeId) {
    if (nodeId.startsWith(`boundary-version:${normalizedPkg}@`)) {
      for (const sourceId of sourceIds) {
        result.add(sourceId);
      }
    }
  }

  return result;
}

/**
 * Find all source entries matching a compound boundary constraint.
 * Returns entries that match ALL provided constraints (AND semantics).
 *
 * @param runtime - The graph runtime snapshot
 * @param constraints - Boundary constraints to match
 * @returns Set of source entry IDs matching all constraints
 */
export function findEntriesByBoundaryConstraints(
  runtime: GraphRuntimeSnapshot,
  constraints: {
    contexts?: string[];
    packages?: string[];
  },
): Set<string> {
  let result: Set<string> | null = null;

  // Intersect context constraints
  for (const context of constraints.contexts ?? []) {
    const contextSources = findEntriesByContext(runtime, context);
    if (result === null) {
      result = new Set(contextSources);
    } else {
      const intersected = new Set<string>();
      for (const id of result) {
        if (contextSources.has(id)) intersected.add(id);
      }
      result = intersected;
    }
  }

  // Intersect package constraints
  for (const pkg of constraints.packages ?? []) {
    const pkgSources = findEntriesByPackage(runtime, pkg);
    if (result === null) {
      result = new Set(pkgSources);
    } else {
      const intersected = new Set<string>();
      for (const id of result) {
        if (pkgSources.has(id)) intersected.add(id);
      }
      result = intersected;
    }
  }

  return result ?? new Set();
}
