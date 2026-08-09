/**
 * ID generation helpers for graph node/edge deterministic IDs.
 */

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Normalize a label into a stable, hyphen-delimited ID fragment.
 * Re-exported from `@trapmap/lib` (`normalizeLabel`) under the historical
 * name so existing importers (llm-extract-merge, graph-llm-extract) stay stable.
 */
export { normalizeLabel as normalizeValue } from '@trapmap/lib';

/** Build a deterministic node ID from kind and label. */
export function buildNodeId(kind: string, label: string): string {
  return `${kind}:${normalizeValue(label)}`;
}

/** Build a deterministic edge ID from source, target, and relation. */
export function buildEdgeId(
  sourceNodeId: string,
  targetNodeId: string,
  relationType: string,
): string {
  return `${sourceNodeId}-${relationType}-${targetNodeId}`;
}
