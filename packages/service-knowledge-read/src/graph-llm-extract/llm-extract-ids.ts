/**
 * ID generation helpers for graph node/edge deterministic IDs.
 */

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Normalize a label into a stable, hyphen-delimited ID fragment. */
export function normalizeValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

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
