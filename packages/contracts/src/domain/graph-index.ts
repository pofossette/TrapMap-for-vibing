import type { Scope } from './common.js';

export type GraphNodeKind =
  | 'trap'
  | 'skill'
  | 'cue'
  | 'tool'
  | 'environment'
  | 'prerequisite'
  | 'mitigation'
  | 'boundary-context'
  | 'boundary-version'
  | 'boundary-platform';

export type GraphRelationType =
  | 'mitigates'
  | 'requires'
  | 'order'
  | 'risk-blocks'
  | 'co-occurs-with'
  | 'applies-in'
  | 'requires-version'
  | 'excludes-context'
  | 'excludes-version';

export type GraphRelationStrength = 'hard' | 'soft';

export interface GraphNodeRecord {
  id: string;
  kind: GraphNodeKind;
  label: string;
  evidence: string;
  severity?: 'hard' | 'soft';
  mitigates?: string[];
  rawLabel?: string;
  canonicalLabelId?: string;
  alignmentDecision?: 'existing' | 'new' | 'unsure';
}

export interface GraphEdgeRecord {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: GraphRelationType;
  strength: GraphRelationStrength;
  evidence: string;
}

export interface GraphIndexDocumentRecord {
  id: string;
  sourceType: 'trap' | 'skill';
  sourceId: string;
  revision: number;
  contentHash: string;
  teamId: string | null;
  scope: Scope;
  requiredLevel: number;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  evidence: string;
  createdAt: string;
  updatedAt: string;
}

/** Derived graph projection port owned by knowledge-read. */
export interface GraphIndexRepositoryPort {
  insert(doc: GraphIndexDocumentRecord): Promise<void>;
  getById(docId: string): Promise<GraphIndexDocumentRecord | null>;
  listBySource(sourceType: string, sourceId: string): Promise<GraphIndexDocumentRecord[]>;
  listAll(): Promise<GraphIndexDocumentRecord[]>;
  upsert(doc: GraphIndexDocumentRecord): Promise<void>;
  remove(docId: string): Promise<void>;
  removeBySource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void>;
}
