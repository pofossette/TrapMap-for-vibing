import type { Graph, GraphEdgeRecord, GraphIndexDocumentRecord } from '@trapmap/contracts';
import Graphology from 'graphology';
import { subgraph } from 'graphology-operators';
import { singleSourceLength } from 'graphology-shortest-path';

type GraphConstructor = new (options?: { type?: string; multi?: boolean }) => Graph;
// lib type gap: graphology's default export types the constructor against
// AbstractGraphOptions; the projection only needs the minimal directed/multi options
const GraphCtor = Graphology as unknown as GraphConstructor; // lib type gap:

function buildGraphFromDocuments(documents: GraphIndexDocumentRecord[]): Graph {
  const graph = new GraphCtor({ type: 'directed', multi: true });
  for (const document of documents) {
    for (const node of document.nodes) {
      graph.mergeNode(node.id, { kind: node.kind, label: node.label });
    }
    for (const edge of document.edges) {
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
  mitigatingSkillNodeIdsByTrapNodeId: Map<string, Set<string>>;
}

export function buildGraphRuntimeSnapshot(
  documents: GraphIndexDocumentRecord[],
): GraphRuntimeSnapshot {
  const documentsBySourceId = new Map<string, GraphIndexDocumentRecord>();
  const nodeIdsByNormalizedLabel = new Map<string, Set<string>>();
  const sourceIdsByNormalizedLabel = new Map<string, Set<string>>();
  const sourceIdsByNodeId = new Map<string, Set<string>>();
  const nodeIdsBySourceId = new Map<string, Set<string>>();
  const mitigatingSkillNodeIdsByTrapNodeId = new Map<string, Set<string>>();

  for (const document of documents) {
    documentsBySourceId.set(document.sourceId, document);
    const sourceNodeIds = nodeIdsBySourceId.get(document.sourceId) ?? new Set<string>();
    nodeIdsBySourceId.set(document.sourceId, sourceNodeIds);
    for (const node of document.nodes) {
      const label = normalizeGraphLabel(node.label);
      addToSetMap(nodeIdsByNormalizedLabel, label, node.id);
      addToSetMap(sourceIdsByNormalizedLabel, label, document.sourceId);
      addToSetMap(sourceIdsByNodeId, node.id, document.sourceId);
      sourceNodeIds.add(node.id);
    }
    for (const edge of document.edges) {
      if (edge.relationType === 'mitigates') {
        addToSetMap(mitigatingSkillNodeIdsByTrapNodeId, edge.targetNodeId, edge.sourceNodeId);
      }
    }
  }

  return {
    graph: buildGraphFromDocuments(documents),
    documentsBySourceId,
    nodeIdsByNormalizedLabel,
    sourceIdsByNormalizedLabel,
    sourceIdsByNodeId,
    nodeIdsBySourceId,
    mitigatingSkillNodeIdsByTrapNodeId,
  };
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

export function expandSourcesOneHop(
  runtime: GraphRuntimeSnapshot,
  queryLabels: Set<string>,
): Set<string> {
  const sources = new Set<string>();
  const seedNodeIds = new Set<string>();
  for (const label of queryLabels) {
    for (const sourceId of runtime.sourceIdsByNormalizedLabel.get(label) ?? [])
      sources.add(sourceId);
    for (const nodeId of runtime.nodeIdsByNormalizedLabel.get(label) ?? []) seedNodeIds.add(nodeId);
  }
  for (const seedNodeId of seedNodeIds) {
    for (const neighborNodeId of runtime.graph.neighbors(seedNodeId)) {
      for (const sourceId of runtime.sourceIdsByNodeId.get(neighborNodeId) ?? []) {
        sources.add(sourceId);
      }
    }
  }
  return sources;
}

export function calculateSourceRelationStrength(
  runtime: GraphRuntimeSnapshot,
  sourceId: string,
  queryLabels: Set<string>,
): number {
  const sourceNodeIds = runtime.nodeIdsBySourceId.get(sourceId);
  if (!sourceNodeIds?.size) return 0;
  const queryNodeIds = new Set<string>();
  for (const label of queryLabels) {
    for (const nodeId of runtime.nodeIdsByNormalizedLabel.get(label) ?? [])
      queryNodeIds.add(nodeId);
  }
  if (!queryNodeIds.size) return 0;
  let strength = 0;
  const countedEdgeIds = new Set<string>();
  for (const nodeId of sourceNodeIds) {
    if (!runtime.graph.hasNode(nodeId)) continue;
    for (const edgeId of runtime.graph.edges(nodeId)) {
      if (countedEdgeIds.has(edgeId)) continue;
      const [sourceNodeId, targetNodeId] = runtime.graph.extremities(edgeId);
      if (!sourceNodeId || !targetNodeId) continue;
      if (!queryNodeIds.has(sourceNodeId) && !queryNodeIds.has(targetNodeId)) continue;
      countedEdgeIds.add(edgeId);
      strength += edgeWeight(runtime.graph.getEdgeAttributes(edgeId).strength ?? 'soft');
    }
  }
  return strength;
}

export interface LocalExpansionParams {
  documents: GraphIndexDocumentRecord[];
  seedNodeIds: string[];
  maxDepth: number;
}

export function buildLocalExpansionView(params: LocalExpansionParams): Graph {
  const graph = buildGraphFromDocuments(params.documents);
  const reachableNodeIds = new Set<string>();
  for (const seedNodeId of params.seedNodeIds) {
    if (!graph.hasNode(seedNodeId)) continue;
    reachableNodeIds.add(seedNodeId);
    const distances = singleSourceLength(graph as never, seedNodeId) as Record<string, number>; // lib type gap:
    // graphology-shortest-path is typed against AbstractGraph; the projection graph is a minimal structural subset
    for (const [nodeId, distance] of Object.entries(distances)) {
      if (distance !== null && distance <= params.maxDepth) reachableNodeIds.add(nodeId);
    }
  }
  return subgraph(graph as never, reachableNodeIds) as Graph; // lib type gap: graphology-operators is
  // typed against AbstractGraph; the projection graph is a minimal structural subset
}
