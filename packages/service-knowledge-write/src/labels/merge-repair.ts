/**
 * Label merge repair and reindex tooling.
 *
 * After a canonical label merge (manual or automatic), affected graph
 * documents must be reindexed to reflect the new canonical IDs.
 * This module reuses the same candidate recall and alignment pipeline.
 */

import type { GraphIndexDocumentRecord, GraphNodeRecord } from '@trapmap/contracts';

import type { LabelRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeRepairReport {
  /** Total graph documents examined */
  examined: number;
  /** Graph documents that were updated */
  updatedDocuments: number;
  /** Nodes that were rewritten to canonical IDs */
  nodesRewritten: number;
  /** Edges that were rewritten due to node ID changes */
  edgesRewritten: number;
  /** Warnings encountered */
  warnings: string[];
}

export interface MergeRepairOptions {
  /** Dry run: preview without writing */
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Core repair function
// ---------------------------------------------------------------------------

/**
 * Repair graph documents after a label merge.
 *
 * For each graph document, check if any node labels have been merged
 * into canonical labels. If so, rewrite the node IDs and edge endpoints
 * to reflect the canonical IDs.
 *
 * @param repository - Label repository for canonical label lookups
 * @param documents - Graph documents to repair
 * @param updateDocument - Callback to persist updated documents
 * @param options - Repair options
 */
export async function repairGraphDocuments(
  repository: LabelRepository,
  documents: GraphIndexDocumentRecord[],
  updateDocument: (doc: GraphIndexDocumentRecord) => Promise<void>,
  options: MergeRepairOptions = {},
): Promise<MergeRepairReport> {
  const { dryRun = false } = options;

  const report: MergeRepairReport = {
    examined: 0,
    updatedDocuments: 0,
    nodesRewritten: 0,
    edgesRewritten: 0,
    warnings: [],
  };

  for (const doc of documents) {
    report.examined++;

    const repaired = await repairDocumentNodes(repository, doc, report);
    if (!repaired.docChanged) continue;

    const updatedEdges = rewriteEdges(doc.edges, repaired.nodeIdMapping, report);
    const deduped = dedupeRepairedDocument(repaired.updatedNodes, updatedEdges);
    report.updatedDocuments++;

    if (!dryRun) {
      await updateDocument({
        ...doc,
        nodes: deduped.nodes,
        edges: deduped.edges,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return report;
}

async function repairDocumentNodes(
  repository: LabelRepository,
  doc: GraphIndexDocumentRecord,
  report: MergeRepairReport,
): Promise<{
  nodeIdMapping: Map<string, string>;
  updatedNodes: GraphNodeRecord[];
  docChanged: boolean;
}> {
  const nodeIdMapping = new Map<string, string>();
  const updatedNodes: GraphNodeRecord[] = [];
  let docChanged = false;

  for (const node of doc.nodes) {
    // Check if this node's label has a canonical mapping
    const canonical = await repository.findCanonicalByAlias(node.label);

    if (canonical && canonical.status === 'active') {
      const canonicalId = `${node.kind}:${canonical.id}`;
      if (canonicalId !== node.id) {
        nodeIdMapping.set(node.id, canonicalId);
        updatedNodes.push({
          ...node,
          id: canonicalId,
          label: canonical.canonicalName,
          rawLabel: node.rawLabel ?? node.label,
          canonicalLabelId: canonical.id,
          alignmentDecision: node.alignmentDecision ?? 'existing',
        });
        report.nodesRewritten++;
        docChanged = true;
      } else {
        // Already canonical, just ensure metadata
        updatedNodes.push({
          ...node,
          rawLabel: node.rawLabel ?? node.label,
          canonicalLabelId: node.canonicalLabelId ?? canonical.id,
          alignmentDecision: node.alignmentDecision ?? 'existing',
        });
      }
    } else {
      // No canonical mapping — keep as-is
      updatedNodes.push(node);
    }
  }

  return { nodeIdMapping, updatedNodes, docChanged };
}

function rewriteEdges(
  edges: GraphIndexDocumentRecord['edges'],
  nodeIdMapping: Map<string, string>,
  report: MergeRepairReport,
): GraphIndexDocumentRecord['edges'] {
  if (nodeIdMapping.size === 0) return edges;
  return edges.map((edge) => {
    const newSource = nodeIdMapping.get(edge.sourceNodeId) ?? edge.sourceNodeId;
    const newTarget = nodeIdMapping.get(edge.targetNodeId) ?? edge.targetNodeId;
    if (newSource === edge.sourceNodeId && newTarget === edge.targetNodeId) {
      return edge;
    }
    report.edgesRewritten++;
    return {
      ...edge,
      sourceNodeId: newSource,
      targetNodeId: newTarget,
      id: `${newSource}-${edge.relationType}-${newTarget}`,
    };
  });
}

function dedupeRepairedDocument(
  updatedNodes: GraphNodeRecord[],
  updatedEdges: GraphIndexDocumentRecord['edges'],
): { nodes: GraphNodeRecord[]; edges: GraphIndexDocumentRecord['edges'] } {
  const dedupedNodes = new Map<string, GraphNodeRecord>();
  for (const node of updatedNodes) {
    const existing = dedupedNodes.get(node.id);
    if (
      !existing ||
      node.evidence.length > existing.evidence.length ||
      (!!node.canonicalLabelId && !existing.canonicalLabelId)
    ) {
      dedupedNodes.set(node.id, node);
    }
  }
  const validNodeIds = new Set(dedupedNodes.keys());
  const dedupedEdges = new Map<string, (typeof updatedEdges)[number]>();
  for (const edge of updatedEdges) {
    if (!validNodeIds.has(edge.sourceNodeId) || !validNodeIds.has(edge.targetNodeId)) {
      continue;
    }
    const edgeId = `${edge.sourceNodeId}-${edge.relationType}-${edge.targetNodeId}`;
    if (!dedupedEdges.has(edgeId)) {
      dedupedEdges.set(edgeId, { ...edge, id: edgeId });
    }
  }
  return { nodes: [...dedupedNodes.values()], edges: [...dedupedEdges.values()] };
}
