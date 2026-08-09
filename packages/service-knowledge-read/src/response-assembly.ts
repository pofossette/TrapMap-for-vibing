/**
 * Response assembly module for retrieval results.
 *
 * This module handles:
 * - Generating human-readable match reasons
 * - Converting knowledge entries to retrieval match schema
 * - Assembling globalConstraints and projectKnowledge buckets
 * - Ensuring no entry appears in both buckets
 * - Attaching citations to matches when available
 *
 * v2 capsule-first assembly:
 * - Building capsule matches from ranked capsule candidates
 * - Building profile hints from artifact metadata
 * - Assembling v2 responses with distilled capsule results
 * - Never exposing raw bundle file contents (T-14-07)
 *
 * This module is called after recall candidates are generated and scored,
 * transforming them into the API response shape.
 */

import type {
  ConflictHint,
  RetrievalCitation,
  RetrievalQuery,
  RetrievalResponse,
  RetrievalSummary,
} from '@trapmap/contracts';
import { retrievalMatchSchema, retrievalResponseSchema } from '@trapmap/contracts';
import type { ScoredEntry } from './retrieval-types.js';

// Type inference from schema - use the return type of parse()
type RetrievalMatch = ReturnType<typeof retrievalMatchSchema.parse>;

/**
 * Generate a human-readable reason for the match.
 */
function generateMatchReason(
  entry: { labels: string[]; scope: string },
  score: number,
  filters: RetrievalQuery['filters'],
): string {
  const parts: string[] = [];

  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    if (matchingLabels.length > 0) {
      parts.push(`matches labels: ${matchingLabels.join(', ')}`);
    }
  }

  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    parts.push(`scope: ${entry.scope}`);
  }

  const baseReason = parts.length > 0 ? parts.join('; ') : 'semantic similarity';
  return `${baseReason} (score: ${score.toFixed(2)})`;
}

/**
 * Convert a scored entry to a retrieval match.
 * Optionally includes citation if provided.
 * Optionally includes conflict hints if provided.
 * Includes boundary explanation when present on the scored entry.
 */
export function toRetrievalMatch(
  scoredEntry: ScoredEntry,
  filters: RetrievalQuery['filters'],
  citation?: RetrievalCitation,
  conflicts?: ConflictHint[],
): RetrievalMatch {
  const { entry, score, boundaryExplanation } = scoredEntry;
  return retrievalMatchSchema.parse({
    entryId: entry.id,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    score,
    reason: generateMatchReason(entry, score, filters),
    citation,
    ...(conflicts && conflicts.length > 0 ? { conflicts } : {}),
    ...(boundaryExplanation ? { boundaryExplanation } : {}),
  });
}

/**
 * Assemble scored entries into globalConstraints and projectKnowledge buckets.
 * Ensures no entry appears in both buckets.
 * Optionally includes citations if provided.
 * Optionally includes conflict hints if provided.
 */
export function assembleResponseBuckets(
  scoredEntries: ScoredEntry[],
  filters: RetrievalQuery['filters'],
  citations?: Map<string, RetrievalCitation>,
  conflictHints?: Map<string, ConflictHint[]>,
): {
  globalConstraints: RetrievalMatch[];
  projectKnowledge: RetrievalMatch[];
} {
  const globalConstraints: RetrievalMatch[] = [];
  const projectKnowledge: RetrievalMatch[] = [];

  for (const scoredEntry of scoredEntries) {
    const citation = citations?.get(scoredEntry.entry.id);
    const conflicts = conflictHints?.get(scoredEntry.entry.id);
    const match = toRetrievalMatch(scoredEntry, filters, citation, conflicts);
    if (scoredEntry.entry.scope === 'global') {
      globalConstraints.push(match);
    } else {
      projectKnowledge.push(match);
    }
  }

  return { globalConstraints, projectKnowledge };
}

/**
 * Build the complete retrieval response.
 * Includes match buckets, optional refinement summary, and optional summary.
 */
export function buildRetrievalResponse(
  globalConstraints: RetrievalMatch[],
  projectKnowledge: RetrievalMatch[],
  refinementSummary: string | null,
  summary: RetrievalSummary | null = null,
): RetrievalResponse {
  return retrievalResponseSchema.parse({
    globalConstraints,
    projectKnowledge,
    refinementSummary,
    summary,
  });
}

/**
 * Create an empty retrieval response when no matches are found.
 */
export function buildEmptyResponse(): RetrievalResponse {
  return retrievalResponseSchema.parse({
    globalConstraints: [],
    projectKnowledge: [],
    refinementSummary: null,
    summary: null,
  });
}
