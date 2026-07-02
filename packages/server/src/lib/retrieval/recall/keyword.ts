/**
 * Keyword recall adapter for query-time lexical matching.
 *
 * This module provides:
 * - Tokenization and normalization of query text
 * - Lexical matching against entry shortcut, detail, and labels
 * - Normalized scoring bounded to [0, 1]
 * - Deterministic, stable results for identical inputs
 *
 * Security note: This adapter accepts only already-filtered eligible entries
 * from the caller. It does NOT perform approval/team/level filtering itself.
 * The filter stage must be applied before calling keywordRecall.
 *
 * Phase 7 hybrid groundwork: This is the keyword recall channel that will be
 * merged with semantic recall and reranked in later plans.
 *
 * Phase 8: Prefers persisted keyword tokens from indexState.keyword for synced
 * entries, falling back to query-time tokenization for legacy entries.
 */

import type { RecallChannel } from '@trapmap/server/lib/retrieval/orchestration/index.js';
import type { RecallCandidate, TokenMatchDetail } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

/**
 * Tokenize text into lowercase alphanumeric tokens.
 * Splits on whitespace, punctuation, underscores, and hyphens.
 * Removes duplicates.
 */
export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  // Split on non-alphanumeric characters (keeps numbers and letters)
  const rawTokens = normalized.split(/[^a-z0-9]+/g);
  const tokenSet = new Set<string>();

  for (const token of rawTokens) {
    if (token.length > 0) {
      tokenSet.add(token);
    }
  }

  return Array.from(tokenSet);
}

/**
 * Normalize query into searchable tokens.
 * Filters out very short tokens (less than 2 characters) to reduce noise.
 */
export function normalizeQuery(query: string): string[] {
  const tokens = tokenize(query);
  return tokens.filter((t) => t.length >= 2);
}

/**
 * Tokenize entry fields for matching.
 * Returns a map from field name to set of tokens.
 *
 * Phase 8: For synced entries, prefers persisted keyword tokens from
 * indexState.keyword to avoid recomputing tokens on every query.
 */
function tokenizeEntry(entry: KnowledgeRecord): {
  shortcut: Set<string>;
  detail: Set<string>;
  labels: Set<string>;
} {
  // Phase 8: Check for persisted keyword state
  if (entry.indexState?.keyword?.status === 'synced') {
    const persistedState = (entry.indexState.keyword as any).persistedState;
    if (persistedState?.fieldTokens) {
      // Use persisted tokens
      return {
        shortcut: new Set(persistedState.fieldTokens.shortcut),
        detail: new Set(persistedState.fieldTokens.detail),
        labels: new Set(persistedState.fieldTokens.labels),
      };
    }
  }

  // Fall back to query-time tokenization for legacy entries
  return {
    shortcut: new Set(tokenize(entry.shortcut)),
    detail: new Set(tokenize(entry.detail)),
    labels: new Set(tokenize(entry.labels.join(' '))),
  };
}

/**
 * Calculate keyword overlap score for a single entry.
 *
 * Scoring strategy:
 * - Label matches are weighted highest (exact label hit = strong signal)
 * - Shortcut matches are weighted second (title/headline match)
 * - Detail matches are weighted lowest (body text match)
 *
 * The score is normalized to [0, 1] based on query token coverage
 * and field importance.
 */
function scoreEntry(
  queryTokens: string[],
  _entry: KnowledgeRecord,
  entryTokens: {
    shortcut: Set<string>;
    detail: Set<string>;
    labels: Set<string>;
  },
): { score: number; tokenMatches: TokenMatchDetail[] } {
  if (queryTokens.length === 0) {
    return { score: 0, tokenMatches: [] };
  }

  const tokenMatches: TokenMatchDetail[] = [];

  // Weights for different field types
  const LABEL_WEIGHT = 3.0;
  const SHORTCUT_WEIGHT = 2.0;
  const DETAIL_WEIGHT = 1.0;

  let totalWeightedScore = 0;
  let maxPossibleScore = 0;

  for (const token of queryTokens) {
    const fields: TokenMatchDetail['fields'] = [];
    let tokenScore = 0;

    // Check labels first (highest weight)
    if (entryTokens.labels.has(token)) {
      tokenScore += LABEL_WEIGHT;
      fields.push('labels');
    }

    // Check shortcut (medium weight)
    if (entryTokens.shortcut.has(token)) {
      tokenScore += SHORTCUT_WEIGHT;
      fields.push('shortcut');
    }

    // Check detail (lowest weight)
    if (entryTokens.detail.has(token)) {
      tokenScore += DETAIL_WEIGHT;
      fields.push('detail');
    }

    // Record match if any field matched
    if (fields.length > 0) {
      tokenMatches.push({ token, fields });
    }

    totalWeightedScore += tokenScore;
    // Max possible score per token: if it matches all three fields
    maxPossibleScore += LABEL_WEIGHT + SHORTCUT_WEIGHT + DETAIL_WEIGHT;
  }

  // Normalize score to [0, 1]
  const score = maxPossibleScore > 0 ? totalWeightedScore / maxPossibleScore : 0;

  return {
    score: Math.min(1, Math.max(0, score)),
    tokenMatches,
  };
}

/**
 * Perform keyword recall over eligible entries.
 *
 * @param queryText - The raw query text to search for
 * @param entries - Already-filtered eligible knowledge entries
 * @returns Array of recall candidates sorted by descending score
 *
 * This function:
 * - Tokenizes and normalizes the query
 * - Scores each entry based on lexical overlap with shortcut/detail/labels
 * - Returns only entries with at least one token match
 * - Sorts candidates by descending score
 *
 * Security: This function does NOT filter by approval state, team, or level.
 * It operates purely on lexical matching. The caller must pass only entries
 * that have been approved and authorized for the requesting user.
 */
export async function keywordRecall(
  queryText: string,
  entries: KnowledgeRecord[],
): Promise<RecallCandidate[]> {
  const queryTokens = normalizeQuery(queryText);

  // No query tokens = no results
  if (queryTokens.length === 0) {
    return [];
  }

  // No entries = no results
  if (entries.length === 0) {
    return [];
  }

  // Pre-tokenize all entries for efficiency
  const entryTokenMaps = new Map<string, ReturnType<typeof tokenizeEntry>>();
  for (const entry of entries) {
    entryTokenMaps.set(entry.id, tokenizeEntry(entry));
  }

  // Score each entry
  const candidates: RecallCandidate[] = [];

  for (const entry of entries) {
    const entryTokens = entryTokenMaps.get(entry.id);
    if (!entryTokens) continue;

    const { score, tokenMatches } = scoreEntry(queryTokens, entry, entryTokens);

    // Only include entries with at least one token match
    if (tokenMatches.length > 0) {
      candidates.push({
        entry,
        channel: 'keyword',
        score,
        tokenMatches,
      });
    }
  }

  // Sort by descending score
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Keyword recall channel implementation.
 * Wraps keywordRecall as a RecallChannel.
 */
export const keywordChannel: RecallChannel = {
  name: 'keyword',
  async recall(queryText: string, entries: KnowledgeRecord[]) {
    return keywordRecall(queryText, entries);
  },
};
