/**
 * Pure trap graph-document candidate builder for adapter sync and reconciliation.
 *
 * Converts extraction output into a GraphIndexDocumentRecord candidate without
 * persisting it, so both the graph adapter and reconciliation can validate
 * candidate additions before any write.
 */

import { buildTrapGraphDocument as buildDocument } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';

/**
 * Input for building a trap graph document from a normalized document and extraction results.
 */
export interface TrapGraphDocumentBuilderInput {
  /** The normalized index document providing governance metadata */
  normalizedDocument: NormalizedIndexDocument;
  /** Extracted nodes from the TrapMap-specific extractor */
  nodes: Array<{ id: string; kind: string; label: string; evidence: string }>;
  /** Extracted edges from the TrapMap-specific extractor */
  edges: Array<{
    relationType: string;
    sourceNodeId: string;
    targetNodeId: string;
    strength: string;
    evidence: string;
  }>;
}

/**
 * Build a candidate GraphIndexDocumentRecord from a normalized document and extraction results.
 *
 * This is a pure function: it does NOT persist the document.
 * The caller (graph adapter or reconciliation) must validate and persist separately.
 */
export function buildTrapGraphDocument(
  input: TrapGraphDocumentBuilderInput,
): GraphIndexDocumentRecord {
  const { normalizedDocument: doc, nodes, edges } = input;

  const edgeRecords: GraphEdgeRecord[] = edges.map((e) => ({
    id: `${e.sourceNodeId}->${e.targetNodeId}:${e.relationType}`,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    relationType: e.relationType as GraphEdgeRecord['relationType'],
    strength: e.strength as GraphEdgeRecord['strength'],
    evidence: e.evidence,
  }));

  const hardRiskBlockTrapIds = new Set<string>();
  for (const edge of edgeRecords) {
    if (edge.relationType === 'risk-blocks' && edge.strength === 'hard') {
      hardRiskBlockTrapIds.add(edge.sourceNodeId);
    }
  }

  const nodeRecords: GraphNodeRecord[] = nodes.map((n) => {
    const record: GraphNodeRecord = {
      id: n.id,
      kind: n.kind as GraphNodeRecord['kind'],
      label: n.label,
      evidence: n.evidence,
    };
    if (n.kind === 'trap') {
      record.severity = hardRiskBlockTrapIds.has(n.id) ? 'hard' : 'soft';
    }
    return record;
  });

  return buildDocument({
    sourceId: doc.entryId,
    revision: doc.revision,
    teamId: doc.teamId,
    scope: doc.scope,
    requiredLevel: doc.requiredLevel,
    nodes: nodeRecords,
    edges: edgeRecords,
  });
}
