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

export type GraphNodeAttributes = { kind?: string; label?: string };
export type GraphEdgeAttributes = {
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
