/**
 * Response assembly module for retrieval results.
 *
 * This module handles:
 * - Generating human-readable match reasons
 * - Converting knowledge entries to retrieval match schema
 * - Assembling globalConstraints and projectKnowledge buckets
 * - Ensuring no entry appears in both buckets
 *
 * This module is called after recall candidates are generated and scored,
 * transforming them into the API response shape.
 */

import type { RetrievalQuery, RetrievalResponse } from '@skill-shareer/contracts';
import { retrievalMatchSchema, retrievalResponseSchema } from '@skill-shareer/contracts';
import type { ScoredEntry } from './types.js';

// Type inference from schema - use the return type of parse()
type RetrievalMatch = ReturnType<typeof retrievalMatchSchema.parse>;

/**
 * Generate a human-readable reason for the match.
 */
export function generateMatchReason(
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
 */
export function toRetrievalMatch(
  scoredEntry: ScoredEntry,
  filters: RetrievalQuery['filters'],
): RetrievalMatch {
  const { entry, score } = scoredEntry;
  return retrievalMatchSchema.parse({
    entryId: entry.id,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    score,
    reason: generateMatchReason(entry, score, filters),
  });
}

/**
 * Assemble scored entries into globalConstraints and projectKnowledge buckets.
 * Ensures no entry appears in both buckets.
 */
export function assembleResponseBuckets(
  scoredEntries: ScoredEntry[],
  filters: RetrievalQuery['filters'],
): {
  globalConstraints: RetrievalMatch[];
  projectKnowledge: RetrievalMatch[];
} {
  const globalConstraints: RetrievalMatch[] = [];
  const projectKnowledge: RetrievalMatch[] = [];

  for (const scoredEntry of scoredEntries) {
    const match = toRetrievalMatch(scoredEntry, filters);
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
 * Includes match buckets and optional refinement summary.
 */
export function buildRetrievalResponse(
  globalConstraints: RetrievalMatch[],
  projectKnowledge: RetrievalMatch[],
  refinementSummary: string | null,
): RetrievalResponse {
  return retrievalResponseSchema.parse({
    globalConstraints,
    projectKnowledge,
    refinementSummary,
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
  });
}
