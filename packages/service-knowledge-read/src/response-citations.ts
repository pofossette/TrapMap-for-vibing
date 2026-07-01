/**
 * Citation builder for retrieval results.
 *
 * This module provides:
 * - Building structured citations from merged candidates
 * - Preserving audit trail (pre-rerank and final scores)
 * - Tracking recall channels and token matches
 * - Generating snippets for display
 *
 * Citations are server-internal (BOUND-01) and are consumed by the
 * assembly stage to populate the response citation field.
 *
 * Security note: Citation builder only consumes already-filtered
 * candidates from the orchestrator. It never bypasses auth or
 * retrieves additional data from the store.
 */

import { retrievalCitationSchema } from '@trapmap/contracts';
import type { MergedCandidate } from '@trapmap/server/lib/retrieval/types.js';

/**
 * Maximum length for citation snippet.
 * Long details are truncated with ellipsis.
 */
const MAX_SNIPPET_LENGTH = 200;

/**
 * Build a citation from a merged candidate.
 *
 * @param candidate - Merged candidate from rerank stage
 * @returns Structured citation matching the contract schema
 *
 * The citation includes:
 * - source: entry ID, scope, and shortcut
 * - snippet: truncated detail text
 * - tags: labels from the entry
 * - recallChannels: which channels contributed
 * - scores: per-channel scores plus pre-rerank and final scores
 */
function buildCitation(candidate: MergedCandidate) {
  const { entry, semanticScore, keywordScore, graphScore, preRerankScore, finalScore, channels } =
    candidate;

  // Build snippet with truncation
  const snippet = buildSnippet(entry.detail);

  // Build score object
  const scores = {
    semantic: semanticScore > 0 ? semanticScore : null,
    keyword: keywordScore > 0 ? keywordScore : null,
    graph: graphScore && graphScore > 0 ? graphScore : null,
    preRerank: preRerankScore,
    final: finalScore,
  };

  // Build citation object
  const citation = {
    source: {
      entryId: entry.id,
      scope: entry.scope,
      shortcut: entry.shortcut,
    },
    sourceType: 'knowledge' as const,
    snippet,
    tags: entry.labels,
    recallChannels: channels,
    scores,
  };

  // Validate against contract schema
  return retrievalCitationSchema.parse(citation);
}

/**
 * Build a snippet from entry detail text.
 * Truncates to MAX_SNIPPET_LENGTH with ellipsis if needed.
 *
 * @param detail - Full detail text
 * @returns Truncated snippet
 */
function buildSnippet(detail: string): string {
  if (detail.length <= MAX_SNIPPET_LENGTH) {
    return detail;
  }

  // Truncate and add ellipsis
  return `${detail.slice(0, MAX_SNIPPET_LENGTH)}...`;
}

/**
 * Build citations from an array of merged candidates.
 *
 * @param candidates - Merged candidates from rerank stage
 * @returns Array of structured citations
 */
export function buildCitations(candidates: MergedCandidate[]) {
  return candidates.map(buildCitation);
}
