import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/server/lib/indexing/graph-lite/documents.js';

export interface ProjectedGraphSource {
  key: string;
  sourceId: string;
  sourceType: GraphIndexDocumentRecord['sourceType'];
  revision: number;
  contentHash: string;
  teamId: string | null;
  scope: GraphIndexDocumentRecord['scope'];
  requiredLevel: number;
  evidence: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectedGraphNode {
  id: string;
  normalizedLabel: string;
  kind: GraphNodeRecord['kind'];
  label: string;
  evidence: string;
  severity: GraphNodeRecord['severity'] | null;
  mitigates: string[];
}

export interface ProjectedGraphRelationship {
  key: string;
  id: string;
  sourceKey: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: GraphEdgeRecord['relationType'];
  strength: GraphEdgeRecord['strength'];
  evidence: string;
}

export interface ProjectedGraphDocument {
  source: ProjectedGraphSource;
  nodes: ProjectedGraphNode[];
  relationships: ProjectedGraphRelationship[];
}

export function buildGraphSourceKey(
  sourceType: GraphIndexDocumentRecord['sourceType'],
  sourceId: string,
): string {
  return `${sourceType}:${sourceId}`;
}

export function normalizeGraphLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '-');
}

export function projectGraphDocument(document: GraphIndexDocumentRecord): ProjectedGraphDocument {
  const sourceKey = buildGraphSourceKey(document.sourceType, document.sourceId);

  return {
    source: {
      key: sourceKey,
      sourceId: document.sourceId,
      sourceType: document.sourceType,
      revision: document.revision,
      contentHash: document.contentHash,
      teamId: document.teamId,
      scope: document.scope,
      requiredLevel: document.requiredLevel,
      evidence: document.evidence,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    },
    nodes: document.nodes.map((node) => ({
      id: node.id,
      normalizedLabel: normalizeGraphLabel(node.label),
      kind: node.kind,
      label: node.label,
      evidence: node.evidence,
      severity: node.severity ?? null,
      mitigates: [...(node.mitigates ?? [])],
    })),
    relationships: document.edges.map((edge) => ({
      key: `${sourceKey}:${edge.id}`,
      id: edge.id,
      sourceKey,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationType: edge.relationType,
      strength: edge.strength,
      evidence: edge.evidence,
    })),
  };
}
