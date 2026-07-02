/**
 * Merging and record conversion for LLM graph extractions.
 *
 * - `mergeExtractions`: deduplicates nodes/edges across multiple segment results
 * - `toGraphRecords`: converts LLM extraction output to typed GraphNodeRecord/GraphEdgeRecord
 * - `dedupeGraphRecords`: deduplicates graph records (nodes by ID, edges by ID)
 */

import type { LlmGraphEdge, LlmGraphExtraction, LlmGraphNode } from '@trapmap/contracts';

import type {
  GraphEdgeRecord,
  GraphNodeKind,
  GraphNodeRecord,
  GraphRelationStrength,
  GraphRelationType,
} from './documents.js';
import { buildEdgeId, buildNodeId, normalizeValue } from './llm-extract-ids.js';

// ---------------------------------------------------------------------------
// Result merging
// ---------------------------------------------------------------------------

/**
 * Merge multiple segment extractions into a single result.
 * Deduplicates nodes by label (keeping the longer description).
 * Deduplicates edges by source+target+relationType.
 */
export function mergeExtractions(extractions: LlmGraphExtraction[]): LlmGraphExtraction {
  const nodeMap = new Map<string, LlmGraphNode>();
  const edgeSet = new Map<string, LlmGraphEdge>();

  for (const extraction of extractions) {
    for (const node of extraction.nodes) {
      const key = `${node.kind}:${normalizeValue(node.label)}`;
      const existing = nodeMap.get(key);
      if (
        !existing ||
        (node.description &&
          (!existing.description || node.description.length > existing.description.length))
      ) {
        nodeMap.set(key, node);
      }
    }
    for (const edge of extraction.edges) {
      const key = `${normalizeValue(edge.sourceLabel)}-${edge.relationType.toLowerCase().trim()}-${normalizeValue(edge.targetLabel)}`;
      if (!edgeSet.has(key)) {
        edgeSet.set(key, edge);
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeSet.values()],
  };
}

// ---------------------------------------------------------------------------
// Convert LLM output to GraphNodeRecord/GraphEdgeRecord
// ---------------------------------------------------------------------------

const LLM_TO_NODE_KIND: Record<string, GraphNodeKind> = {
  trap: 'trap',
  skill: 'skill',
  cue: 'cue',
  tool: 'tool',
  environment: 'environment',
  prerequisite: 'prerequisite',
  mitigation: 'mitigation',
};

const LLM_TO_RELATION_TYPE: Record<string, GraphRelationType> = {
  mitigates: 'mitigates',
  requires: 'requires',
  order: 'order',
  'risk-blocks': 'risk-blocks',
  'co-occurs-with': 'co-occurs-with',
};

const RELATION_ALIASES: Record<string, string> = {
  mitigate: 'mitigates',
  require: 'requires',
  'co-occurs': 'co-occurs-with',
  'risk-block': 'risk-blocks',
  orders: 'order',
};

/**
 * Convert LLM extraction output to typed GraphNodeRecord[] and GraphEdgeRecord[].
 * Maps LLM labels to node IDs and validates kind/relationType values.
 */
export function toGraphRecords(extraction: LlmGraphExtraction): {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
} {
  const nodeIdByLabel = new Map<string, string>();

  const nodes: GraphNodeRecord[] = [];
  for (const node of extraction.nodes) {
    const kind = LLM_TO_NODE_KIND[node.kind];
    if (!kind) continue;
    const id = buildNodeId(kind, node.label);
    nodeIdByLabel.set(normalizeValue(node.label), id);
    nodes.push({
      id,
      kind,
      label: node.label,
      evidence: node.description ?? 'llm-extracted',
    });
  }

  const edges: GraphEdgeRecord[] = [];
  let skippedEdgeCount = 0;
  for (const edge of extraction.edges) {
    const normalizedType = edge.relationType.toLowerCase().trim();
    const relationType =
      LLM_TO_RELATION_TYPE[normalizedType] ??
      LLM_TO_RELATION_TYPE[RELATION_ALIASES[normalizedType] ?? ''];
    if (!relationType) {
      skippedEdgeCount++;
      continue;
    }
    const sourceId = nodeIdByLabel.get(normalizeValue(edge.sourceLabel));
    const targetId = nodeIdByLabel.get(normalizeValue(edge.targetLabel));
    if (!sourceId || !targetId) {
      skippedEdgeCount++;
      continue;
    }
    edges.push({
      id: buildEdgeId(sourceId, targetId, relationType),
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      relationType,
      strength: edge.strength as GraphRelationStrength,
      evidence: edge.description ?? 'llm-extracted',
    });
  }

  if (skippedEdgeCount > 0) {
    console.warn(
      `[toGraphRecords] skipped ${skippedEdgeCount} edge(s) (unknown relationType or missing node)`,
    );
  }

  return { nodes, edges };
}

export function dedupeGraphRecords(records: {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}): { nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] } {
  const nodeMap = new Map<string, GraphNodeRecord>();
  for (const node of records.nodes) {
    const existing = nodeMap.get(node.id);
    if (
      !existing ||
      node.evidence.length > existing.evidence.length ||
      (!!node.canonicalLabelId && !existing.canonicalLabelId)
    ) {
      nodeMap.set(node.id, node);
    }
  }

  const validNodeIds = new Set(nodeMap.keys());
  const edgeMap = new Map<string, GraphEdgeRecord>();
  for (const edge of records.edges) {
    if (!validNodeIds.has(edge.sourceNodeId) || !validNodeIds.has(edge.targetNodeId)) {
      continue;
    }
    const id = buildEdgeId(edge.sourceNodeId, edge.targetNodeId, edge.relationType);
    if (!edgeMap.has(id)) {
      edgeMap.set(id, { ...edge, id });
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  };
}
