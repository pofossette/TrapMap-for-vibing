/**
 * Knowledge-read admin graph mapping — pure domain helpers.
 *
 * Converts persisted {@link GraphIndexDocumentRecord} aggregates (the
 * `graph_index_documents` projection) into the {@link AdminGraphResponse}
 * shape consumed by the Web Panel. Zero framework / DB imports — rendering
 * stays in the service/host infrastructure, the *mapping* lives here so
 * both `service-knowledge-read` and `host-local` (and future
 * `host-distributed`) share a single source of truth.
 *
 * Caps:
 * - Depth caps (`ADMIN_GRAPH_DEPTH_*_MAX_NODES`) cap the ad-hoc
 *   neighborhood expansion that `filterGraphByQuery` performs *before*
 *   pagination. They are intentionally smaller than the pagination limit so
 *   a depth=1 preview stays legible.
 * - `ADMIN_GRAPH_MAX_NODES` (100) mirrors `adminGraphQuerySchema.limit`
 *   max (1..100). The pagination handler in `routes.ts` clamps
 *   `query.limit` to that range via Zod; depth caps are always ≤ this.
 * - Governance filtering (teamId / requiredLevel) runs *first*, depth caps
 *   second, cursor/limit pagination last — so a low-privilege caller never
 *   sees a high `requiredLevel` node even when a depth cap would otherwise
 *   have trimmed it away, and pagination never leaks nodes hidden by depth.
 */

import type { AdminGraphResponse, GraphIndexDocumentRecord } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Caps — aligned to adminGraphQuerySchema
// ---------------------------------------------------------------------------

/** Node cap for `depth=1` preview (shallow neighborhood). */
export const ADMIN_GRAPH_DEPTH_1_MAX_NODES = 10;

/** Node cap for `depth=2` preview (expanded neighborhood). */
export const ADMIN_GRAPH_DEPTH_2_MAX_NODES = 50;

/**
 * Absolute pagination ceiling for admin graph queries.
 * Mirrors `adminGraphQuerySchema.shape.limit` (`1..100`). Exported so hosts
 * can reuse the same bound when validating or documenting caps.
 */
export const ADMIN_GRAPH_MAX_NODES = 100;

// ---------------------------------------------------------------------------
// Document → AdminGraphResponse mapping
// ---------------------------------------------------------------------------

function mapNodeToAdminNode(
  node: GraphIndexDocumentRecord['nodes'][number],
  doc: GraphIndexDocumentRecord,
): AdminGraphResponse['nodes'][number] {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    // Passthrough extras — `adminGraphNodeSchema` is `.passthrough()` so
    // panel G6 columns can read them without a schema change.
    ...(node.severity !== undefined ? { severity: node.severity } : {}),
    teamId: doc.teamId,
    requiredLevel: doc.requiredLevel,
    scope: doc.scope,
  } as AdminGraphResponse['nodes'][number];
}

function mapEdgeToAdminEdge(
  edge: GraphIndexDocumentRecord['edges'][number],
): AdminGraphResponse['edges'][number] {
  return {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    kind: edge.relationType,
    label: edge.evidence,
  } as AdminGraphResponse['edges'][number];
}

/**
 * Convert a set of {@link GraphIndexDocumentRecord} documents to the
 * {@link AdminGraphResponse} wire shape.
 *
 * Each document contributes its nodes (enriched with `teamId`,
 * `requiredLevel`, `scope` from the document header) and edges (with
 * `sourceNodeId`/`targetNodeId` projected to `source`/`target`).
 * Callers are responsible for filtering `documents` by `sourceType` or
 * `artifactId` before invoking.
 */
export function mapGraphDocumentsToAdminGraphResponse(
  documents: readonly GraphIndexDocumentRecord[],
): AdminGraphResponse {
  return {
    nodes: documents.flatMap((doc) => doc.nodes.map((node) => mapNodeToAdminNode(node, doc))),
    edges: documents.flatMap((doc) => doc.edges.map((edge) => mapEdgeToAdminEdge(edge))),
  };
}

/**
 * Convert documents to the `listGraphDocuments` view used as a
 * low-fidelity fallback in `service-knowledge-read`.
 *
 * Nodes/edges are trimmed to the minimal G6 triple so that the caller can
 * later re-derive visibility via `isGraphNodeVisible`; governance fields
 * (`teamId`, `requiredLevel`) and `artifactId` are hoisted to the wrapper.
 */
export function mapGraphDocumentsToListView(documents: readonly GraphIndexDocumentRecord[]): Array<{
  nodes: AdminGraphResponse['nodes'];
  edges: AdminGraphResponse['edges'];
  teamId: string | null;
  requiredLevel: number;
  artifactId: string;
}> {
  return documents.map((doc) => ({
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
    })) as AdminGraphResponse['nodes'],
    edges: doc.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
    })) as AdminGraphResponse['edges'],
    teamId: doc.teamId,
    requiredLevel: doc.requiredLevel,
    artifactId: doc.sourceId,
  }));
}

/**
 * Filter a `listAll()` snapshot by `artifactId` / `sourceType`.
 *
 * Mirrors the predicate previously duplicated in `host-local/app.module.ts`
 * `getTrapGraph` / `getSkillGraph`. `artifactId` takes precedence — when
 * set, the filter matches `sourceId` exactly (scoped view); otherwise it
 * narrows by `sourceType`.
 */
export function filterGraphDocumentsBySource(
  documents: readonly GraphIndexDocumentRecord[],
  filter: { artifactId?: string; sourceType?: 'trap' | 'skill' },
): GraphIndexDocumentRecord[] {
  if (filter.artifactId) {
    return documents.filter((doc) => doc.sourceId === filter.artifactId);
  }
  if (filter.sourceType) {
    return documents.filter((doc) => doc.sourceType === filter.sourceType);
  }
  return [...documents];
}
