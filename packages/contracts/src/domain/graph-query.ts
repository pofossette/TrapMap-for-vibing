import Graphology from 'graphology';
import { hasCycle } from 'graphology-dag';
import { subgraph } from 'graphology-operators';
import { singleSourceLength } from 'graphology-shortest-path';
import type { Boundary, ExclusionRule, VersionConstraint } from './boundary.js';
import type { Scope } from './common.js';
import type { GraphEdgeRecord, GraphIndexDocumentRecord, GraphNodeRecord } from './graph-index.js';

export type GraphQueryBackendKind = 'memory' | 'neo4j';
export type GraphQueryMode = 'disabled' | 'enabled-primary' | 'enabled-fallback';

export interface GraphQueryBackendHealth {
  ok: boolean;
  mode: GraphQueryMode;
  detail?: string;
}

export interface GraphQueryRuntimeState {
  mode: GraphQueryMode;
  backendKind: GraphQueryBackendKind;
  failOpen: boolean;
  detail?: string;
}

export interface GraphQueryNodeView {
  sourceId: string;
  sourceType: GraphIndexDocumentRecord['sourceType'];
  teamId: string | null;
  scope: Scope;
  requiredLevel: number;
  documentEvidence: string;
  node: GraphNodeRecord;
}

type GraphNodeAttributes = { kind?: string; label?: string };
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

export interface GraphQueryExpansionView {
  graph: Graph;
  nodeViewsById: Map<string, GraphQueryNodeView>;
  nodeIdsBySourceId: Map<string, Set<string>>;
}

export interface GraphQueryBackend {
  readonly kind: GraphQueryBackendKind;
  isEnabled(): boolean;
  getRuntimeState(): GraphQueryRuntimeState;
  healthcheck(): Promise<GraphQueryBackendHealth>;
  upsertDocument(document: GraphIndexDocumentRecord): Promise<void>;
  removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void>;
  rebuildProjection(documents: GraphIndexDocumentRecord[]): Promise<void>;
  expandSourcesOneHop(params: {
    queryLabels: Set<string>;
    eligibleSourceIds?: Set<string>;
  }): Promise<Set<string>>;
  calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number>;
  getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>>;
  buildLocalExpansionView(params: {
    seedNodeIds: string[];
    maxDepth: number;
    auth: { teamId: string | null; securityLevel: number };
  }): Promise<GraphQueryExpansionView>;
  findMitigatingSkills(trapNodeIds: string[]): Promise<string[]>;
}

const GraphCtor = Graphology as unknown as new (options?: {
  type?: string;
  multi?: boolean;
}) => Graph;

export function buildGraphFromDocuments(documents: GraphIndexDocumentRecord[]): Graph {
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

const HARD_RELATION_TYPES: ReadonlySet<string> = new Set([
  'requires',
  'risk-blocks',
  'requires-version',
]);

export function projectHardDependencyGraph(documents: GraphIndexDocumentRecord[]): Graph {
  const graph = new GraphCtor({ type: 'directed', multi: true });
  for (const document of documents) {
    for (const edge of document.edges) {
      if (HARD_RELATION_TYPES.has(edge.relationType) && edge.strength === 'hard') {
        graph.mergeNode(edge.sourceNodeId);
        graph.mergeNode(edge.targetNodeId);
        graph.mergeEdgeWithKey(edge.id, edge.sourceNodeId, edge.targetNodeId, {
          relationType: edge.relationType,
          strength: edge.strength,
        });
      }
    }
  }
  return graph;
}

export function assertNoHardDependencyCycles(documents: GraphIndexDocumentRecord[]): void {
  if (hasCycle(projectHardDependencyGraph(documents) as never)) {
    throw new Error('hard dependency cycle detected');
  }
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
    const distances = singleSourceLength(graph as never, seedNodeId) as Record<string, number>;
    for (const [nodeId, distance] of Object.entries(distances)) {
      if (distance !== null && distance <= params.maxDepth) reachableNodeIds.add(nodeId);
    }
  }
  return subgraph(graph as never, reachableNodeIds) as Graph;
}

export function normalizeContextLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

export function normalizePackageName(name: string): string {
  return name.toLowerCase().trim();
}

export function buildVersionNodeId(constraint: VersionConstraint): string {
  return `boundary-version:${normalizePackageName(constraint.package)}@${constraint.range}`;
}

export function buildContextNodeId(label: string): string {
  return `boundary-context:${normalizeContextLabel(label)}`;
}

export function buildPlatformNodeId(name: string): string {
  return `boundary-platform:${normalizeContextLabel(name)}`;
}

const COMMON_PLATFORMS = [
  'linux',
  'windows',
  'macos',
  'darwin',
  'docker',
  'kubernetes',
  'k8s',
  'aws',
  'azure',
  'gcp',
  'ci',
  'cd',
  'localhost',
] as const;

export function extractPlatformsFromExclusions(exclusions: ExclusionRule[]): string[] {
  const platforms: string[] = [];
  for (const exclusion of exclusions) {
    if (exclusion.kind === 'platform') {
      const description = exclusion.description.toLowerCase();
      for (const platform of COMMON_PLATFORMS) {
        if (description.includes(platform)) platforms.push(platform);
      }
    }
  }
  return [...new Set(platforms)];
}

export interface BoundaryFacetIndex {
  contexts: string[];
  packages: string[];
  platforms: string[];
  versionConstraints: string[];
}

export function buildBoundaryFacetIndex(boundary: Boundary | null): BoundaryFacetIndex {
  if (!boundary) return { contexts: [], packages: [], platforms: [], versionConstraints: [] };
  const contexts = boundary.context.map(normalizeContextLabel);
  const packages = boundary.versions.map((version) => normalizePackageName(version.package));
  const platforms = extractPlatformsFromExclusions(boundary.exclusions);
  const versionConstraints = boundary.versions.map(
    (version) => `${normalizePackageName(version.package)}@${version.range}`,
  );
  return {
    contexts: [...new Set(contexts)],
    packages: [...new Set(packages)],
    platforms: [...new Set(platforms)],
    versionConstraints: [...new Set(versionConstraints)],
  };
}

export function findEntriesByContext(
  runtime: GraphRuntimeSnapshot,
  contextLabel: string,
): Set<string> {
  return runtime.sourceIdsByNodeId.get(buildContextNodeId(contextLabel)) ?? new Set();
}

function findEntriesByPackage(runtime: GraphRuntimeSnapshot, packageName: string): Set<string> {
  const results = new Set<string>();
  for (const [nodeId, sourceIds] of runtime.sourceIdsByNodeId) {
    if (nodeId.startsWith(`boundary-version:${packageName.toLowerCase()}@`)) {
      for (const sourceId of sourceIds) results.add(sourceId);
    }
  }
  return results;
}

export function findEntriesByBoundaryConstraints(
  runtime: GraphRuntimeSnapshot,
  constraints: { contexts?: string[]; packages?: string[] },
): Set<string> {
  let result: Set<string> | null = null;
  for (const sources of [
    ...(constraints.contexts ?? []).map((context) => findEntriesByContext(runtime, context)),
    ...(constraints.packages ?? []).map((packageName) =>
      findEntriesByPackage(runtime, packageName),
    ),
  ]) {
    result =
      result === null ? new Set(sources) : new Set([...result].filter((id) => sources.has(id)));
  }
  return result ?? new Set();
}
