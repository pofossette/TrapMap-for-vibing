import type {
  Graph,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/server/lib/indexing/graph-lite/index.js';

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
  scope: GraphIndexDocumentRecord['scope'];
  requiredLevel: number;
  documentEvidence: string;
  node: GraphNodeRecord;
}

export interface GraphQueryExpansionView {
  graph: Graph;
  nodeViewsById: Map<string, GraphQueryNodeView>;
  nodeIdsBySourceId: Map<string, Set<string>>;
}

export interface GraphQueryBackend {
  kind: GraphQueryBackendKind;
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
