/**
 * Graph node canonical alignment integration.
 *
 * Provides `alignGraphNodes()` which takes raw extracted nodes and runs
 * them through the label alignment pipeline, rewriting node IDs and
 * edge endpoints to canonical forms when alignment succeeds.
 */

import type { LlmGraphNode } from '@trapmap/contracts';

import type { ChatProvider, EmbeddingsProvider } from '@trapmap/server/lib/ai/types.js';
import type { GraphNodeRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import { normalizeValue } from '@trapmap/server/lib/indexing/graph-lite/llm-extract-ids.js';
import { alignLabel } from './llm-align.js';
import type { AlignLabelOptions } from './llm-align.js';
import type { LabelRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlignmentServiceOptions {
  /** Chat provider for LLM alignment (null = skip alignment) */
  chat: ChatProvider | null;
  /** Label repository (null = skip alignment) */
  repository: LabelRepository | null;
  /** Embeddings provider for semantic candidate recall (null = skip embedding recall) */
  embeddings: EmbeddingsProvider | null;
  /** Source context for alignment events */
  sourceContext?: string;
}

export interface AlignedNode extends GraphNodeRecord {
  /** Original raw label before alignment */
  rawLabel: string;
  /** Canonical label ID (present only when alignment resolved to a canonical label) */
  canonicalLabelId?: string;
  /** Alignment decision */
  alignmentDecision: 'existing' | 'new' | 'unsure';
}

export interface AlignGraphNodesResult {
  /** Aligned nodes with canonical metadata */
  nodes: AlignedNode[];
  /** Mapping from old node IDs to new canonical node IDs (for edge rewriting) */
  nodeIdMapping: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Core alignment function
// ---------------------------------------------------------------------------

/**
 * Align raw extracted graph nodes against the canonical label catalog.
 *
 * For each node:
 * 1. Call `alignLabel()` with the node's label and evidence
 * 2. If decision is 'existing': rewrite node ID to use canonicalLabelId
 * 3. If decision is 'new': rewrite node ID to use new canonical name
 * 4. If decision is 'unsure' or alignment skipped: keep raw label
 *
 * Returns aligned nodes and a mapping from old → new node IDs for edge rewriting.
 */
export async function alignGraphNodes(
  nodes: LlmGraphNode[],
  options: AlignmentServiceOptions,
): Promise<AlignGraphNodesResult> {
  const { chat, repository, embeddings, sourceContext = 'extraction' } = options;

  // Skip alignment if chat or repository is not available
  if (!chat || !chat.isConfigured || !repository) {
    return {
      nodes: nodes.map((n) => ({
        id: buildRawNodeId(n.kind, n.label),
        kind: n.kind as GraphNodeRecord['kind'],
        label: n.label,
        evidence: n.description ?? 'llm-extracted',
        rawLabel: n.label,
        alignmentDecision: 'unsure' as const,
      })),
      nodeIdMapping: new Map(),
    };
  }

  const alignedNodes: AlignedNode[] = [];
  const nodeIdMapping = new Map<string, string>();

  for (const node of nodes) {
    const rawId = buildRawNodeId(node.kind, node.label);
    const evidence = node.description ?? 'llm-extracted';

    try {
      const alignOpts: AlignLabelOptions = { sourceContext };
      if (embeddings) alignOpts.embeddings = embeddings;
      const result = await alignLabel(repository, chat, node.label, evidence, node.kind, alignOpts);

      const decision = result.decision;

      if (decision.decision === 'existing' && decision.canonicalLabelId) {
        // Rewrite to canonical ID
        const canonicalId = buildCanonicalNodeId(node.kind, decision.canonicalLabelId);
        alignedNodes.push({
          id: canonicalId,
          kind: node.kind as GraphNodeRecord['kind'],
          label: decision.canonicalName ?? node.label,
          evidence,
          rawLabel: node.label,
          canonicalLabelId: decision.canonicalLabelId,
          alignmentDecision: 'existing',
        });
        if (canonicalId !== rawId) {
          nodeIdMapping.set(rawId, canonicalId);
        }
      } else if (decision.decision === 'new' && decision.canonicalLabelId) {
        // Rewrite to new canonical ID
        const canonicalId = buildCanonicalNodeId(node.kind, decision.canonicalLabelId);
        alignedNodes.push({
          id: canonicalId,
          kind: node.kind as GraphNodeRecord['kind'],
          label: decision.canonicalName ?? node.label,
          evidence,
          rawLabel: node.label,
          canonicalLabelId: decision.canonicalLabelId,
          alignmentDecision: 'new',
        });
        if (canonicalId !== rawId) {
          nodeIdMapping.set(rawId, canonicalId);
        }
      } else {
        // Unsure or no decision — keep raw label
        alignedNodes.push({
          id: rawId,
          kind: node.kind as GraphNodeRecord['kind'],
          label: node.label,
          evidence,
          rawLabel: node.label,
          alignmentDecision: 'unsure',
        });
      }
    } catch {
      // Alignment failed — keep raw label
      alignedNodes.push({
        id: rawId,
        kind: node.kind as GraphNodeRecord['kind'],
        label: node.label,
        evidence,
        rawLabel: node.label,
        alignmentDecision: 'unsure',
      });
    }
  }

  return { nodes: alignedNodes, nodeIdMapping };
}

/**
 * Rewrite edge node IDs using the provided mapping.
 * Returns new edges with updated source/target IDs.
 */
export function rewriteEdgeIds<
  T extends { sourceNodeId: string; targetNodeId: string; id?: string },
>(edges: T[], nodeIdMapping: Map<string, string>): T[] {
  if (nodeIdMapping.size === 0) return edges;

  return edges.map((edge) => {
    const newSource = nodeIdMapping.get(edge.sourceNodeId) ?? edge.sourceNodeId;
    const newTarget = nodeIdMapping.get(edge.targetNodeId) ?? edge.targetNodeId;
    const changed = newSource !== edge.sourceNodeId || newTarget !== edge.targetNodeId;

    if (!changed) return edge;

    return {
      ...edge,
      sourceNodeId: newSource,
      targetNodeId: newTarget,
      ...(edge.id
        ? { id: `${newSource}-${edge.id.split('-').slice(1, -1).join('-')}-${newTarget}` }
        : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRawNodeId(kind: string, label: string): string {
  return `${kind}:${normalizeValue(label)}`;
}

function buildCanonicalNodeId(kind: string, canonicalLabelId: string): string {
  return `${kind}:${canonicalLabelId}`;
}
