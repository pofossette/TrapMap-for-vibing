/**
 * Back-reference query helper for boundary-constrained entry lookup.
 *
 * Provides:
 * - findEntriesByBoundaryConstraint: Scan indexed facets to find entries matching a boundary constraint
 * - findEntriesByGraphNode: Find entries containing a specific boundary graph node
 *
 * All functions are pure (no side effects, no I/O).
 */

import {
  normalizeContextLabel,
  normalizePackageName,
} from '@trapmap/server/lib/indexing/boundary-normalize.js';
import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/index.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

/**
 * Constraint for back-reference queries.
 * Each field narrows the result set independently.
 */
export interface BoundaryQueryConstraint {
  context?: string;
  platform?: string;
  package?: string;
}

/**
 * Find all knowledge entries matching a boundary constraint.
 * Scans pre-indexed boundary facets from the keyword adapter persisted state.
 *
 * @param entries - Knowledge entries with index state
 * @param constraint - Boundary constraint to match
 * @returns Entries whose indexed boundary facets match all constraint fields
 */
export function findEntriesByBoundaryConstraint(
  entries: KnowledgeRecord[],
  constraint: BoundaryQueryConstraint,
): KnowledgeRecord[] {
  return entries.filter((entry) => {
    if (!entry.indexState?.keyword || entry.indexState.keyword.status !== 'synced') return false;

    const facets = (entry.indexState.keyword as any).persistedState?.boundaryFacets;
    if (!facets || !entry.boundary) return false;

    if (constraint.context) {
      const normalized = normalizeContextLabel(constraint.context);
      if (!facets.contexts?.includes(normalized)) return false;
    }
    if (constraint.platform) {
      if (!facets.platforms?.includes(constraint.platform)) return false;
    }
    if (constraint.package) {
      const normalized = normalizePackageName(constraint.package);
      if (!facets.packages?.includes(normalized)) return false;
    }
    return true;
  });
}

/**
 * Find entry IDs containing a specific boundary graph node.
 *
 * @param graphDocs - Graph index documents to scan
 * @param nodeKind - Boundary node kind to match
 * @param nodeLabel - Node label to match
 * @returns Source IDs of documents containing the matching node (deduplicated)
 */
export function findEntriesByGraphNode(
  graphDocs: GraphIndexDocumentRecord[],
  nodeKind: 'boundary-context' | 'boundary-version' | 'boundary-platform',
  nodeLabel: string,
): string[] {
  const entryIds: string[] = [];
  for (const doc of graphDocs) {
    const hasMatchingNode = doc.nodes.some((n) => n.kind === nodeKind && n.label === nodeLabel);
    if (hasMatchingNode) {
      entryIds.push(doc.sourceId);
    }
  }
  return [...new Set(entryIds)];
}
