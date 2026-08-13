/**
 * Knowledge-read bounded context — response assembly rules.
 *
 * Pure retrieval response assembly (match reason rendering, bucket
 * assignment, response construction) with zero framework, DB or I/O
 * imports. The service application layer renders these rules over scored
 * recall results.
 */

import {
  type BoundaryExplanation,
  type ConflictHint,
  type RetrievalCitation,
  type RetrievalQuery,
  type RetrievalResponse,
  type RetrievalSummary,
  retrievalMatchSchema,
  retrievalResponseSchema,
} from '@trapmap/contracts';

export type RetrievalMatch = ReturnType<typeof retrievalMatchSchema.parse>;

export interface MatchableEntryView {
  id: string;
  scope: string;
  requiredLevel: number;
  shortcut: string;
  detail: string;
  labels: readonly string[];
}

export interface ScoredEntryLike<E> {
  entry: E;
  score: number;
  boundaryExplanation?: BoundaryExplanation;
}

/**
 * Human-readable match reason: label matches and scope match, falling back
 * to a generic semantic-similarity reason with the score appended.
 */
export function generateMatchReason(
  entry: { labels: readonly string[]; scope: string },
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
 * Convert a scored entry to a retrieval match, optionally attaching a
 * citation, conflict hints and a boundary explanation.
 */
export function toRetrievalMatch<E extends MatchableEntryView>(
  scoredEntry: ScoredEntryLike<E>,
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
 * Assemble scored entries into globalConstraints and projectKnowledge
 * buckets. Global-scope entries land in globalConstraints; everything else
 * in projectKnowledge.
 */
export function assembleResponseBuckets<E extends MatchableEntryView>(
  scoredEntries: ScoredEntryLike<E>[],
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

/** Build the complete retrieval response with optional refinement/summary. */
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

/** Create an empty retrieval response when no matches are found. */
export function buildEmptyResponse(): RetrievalResponse {
  return retrievalResponseSchema.parse({
    globalConstraints: [],
    projectKnowledge: [],
    refinementSummary: null,
    summary: null,
  });
}
