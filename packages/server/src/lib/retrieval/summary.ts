/**
 * Summary builder for retrieval results.
 *
 * This module provides:
 * - Building optional summaries from filtered retrieval hits
 * - Generating extractive summaries from hit content
 * - Including citations with summary output
 * - Building summaries from distilled capsule hits (Phase 14 v2)
 *
 * Security note: Summary builder only consumes already-filtered hits
 * and citations from the orchestrator. It never bypasses auth or
 * retrieves additional data from the store. This is a pure function
 * with no external dependencies (no store, recall adapters, or graph index).
 *
 * Per threat model T-10-07: Summary Builder is designed as a pure function
 * that only accepts safe hits/citations from the orchestrator.
 * Per threat model T-14-08: Summary builder is limited to filtered distilled
 * hits/citations so it cannot bypass governance filters.
 */

import type { CapsuleMatch, RetrievalCitation, RetrievalSummary } from '@trapmap/contracts';
import { retrievalSummarySchema } from '@trapmap/contracts';

/**
 * Input hit for summary generation.
 * Represents a single retrieval result that has passed all filters.
 */
interface SummaryHit {
  /** The shortcut/title of the knowledge entry */
  shortcut: string;
  /** The detailed content of the knowledge entry */
  detail: string;
  /** Labels/tags associated with the entry */
  labels: string[];
}

/**
 * Options for building a summary.
 */
interface BuildSummaryOptions {
  /** The search query */
  query: string;
  /** Whether summary generation is enabled */
  includeSummary: boolean;
  /** The filtered retrieval hits to summarize */
  hits: SummaryHit[];
  /** Optional citations to include with the summary */
  citations?: RetrievalCitation[];
}

/**
 * Build an optional summary from retrieval hits.
 *
 * This function implements a deterministic extractive summary baseline:
 * - Returns null if summary is disabled or no hits provided
 * - Returns null if no citations are provided (citations are required by contract)
 * - Generates summary text solely from the provided hits
 * - Includes citations when provided
 * - Does not call any external services or access the store
 *
 * @param options - Summary building options
 * @returns Structured summary with citations, or null if disabled/empty
 *
 * Security: This function only operates on the provided hits and citations.
 * It does NOT access the store, recall adapters, or graph index.
 */
export function buildSummary(options: BuildSummaryOptions): RetrievalSummary | null {
  const { query, includeSummary, hits, citations } = options;

  // Return null if summary is disabled
  if (!includeSummary) {
    return null;
  }

  // Return null if no hits to summarize
  if (!hits || hits.length === 0) {
    return null;
  }

  // Return null if no citations are provided
  // The contract schema requires at least 1 citation
  if (!citations || citations.length === 0) {
    return null;
  }

  // Generate extractive summary text from hits
  const text = generateExtractiveSummary(query, hits);

  // Build summary object
  const summary = {
    text,
    citations,
  };

  // Validate against contract schema
  return retrievalSummarySchema.parse(summary);
}

/**
 * Generate an extractive summary from retrieval hits.
 *
 * This is a deterministic baseline implementation that:
 * - Extracts key information from the provided hits
 * - Does NOT call any external services
 * - Produces consistent output for the same inputs
 *
 * @param query - The search query (for context)
 * @param hits - The filtered retrieval hits
 * @returns Extractive summary text
 *
 * Note: This is a baseline extractive implementation. Future enhancements
 * could include LLM-based abstractive summarization, but this baseline
 * ensures the summary builder is deterministic and has no external dependencies.
 */
function generateExtractiveSummary(query: string, hits: SummaryHit[]): string {
  if (hits.length === 0) {
    return '';
  }

  // For single hit, return the detail directly
  if (hits.length === 1) {
    const hit = hits[0];
    if (!hit) return '';
    return `${hit.shortcut}: ${hit.detail}`;
  }

  // For multiple hits, create a concise extractive summary
  // This is a deterministic baseline that combines key points
  const parts: string[] = [];

  for (const hit of hits) {
    // Add the shortcut as a bullet point
    parts.push(`• ${hit.shortcut}: ${truncateText(hit.detail, 120)}`);
  }

  return `Based on ${hits.length} result${hits.length > 1 ? 's' : ''}:\n${parts.join('\n')}`;
}

/**
 * Truncate text to a maximum length with ellipsis.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

// =============================================================================
// Phase 14 v2 Summary: Capsule-first summary building (T-14-08)
// Pure function that only consumes already-filtered distilled capsule hits.
// =============================================================================

/**
 * Build an optional summary from distilled capsule hits.
 *
 * Per T-14-08: Summary builder is limited to filtered distilled hits/citations
 * so it cannot bypass governance filters.
 *
 * This function:
 * - Returns null if summary is disabled or no hits provided
 * - Returns null if no citations are provided (citations are required by contract)
 * - Generates summary text solely from the provided capsule hits
 * - Does not call any external services or access the store
 *
 * @param options - Summary building options for capsules
 * @returns Structured summary with citations, or null if disabled/empty
 */
export function buildCapsuleSummary(options: {
  /** The search query */
  query: string;
  /** Whether summary generation is enabled */
  includeSummary: boolean;
  /** The filtered distilled capsule hits to summarize */
  capsules: CapsuleMatch[];
  /** Optional citations to include with the summary */
  citations?: RetrievalCitation[];
}): RetrievalSummary | null {
  const { query, includeSummary, capsules, citations } = options;

  // Return null if summary is disabled
  if (!includeSummary) {
    return null;
  }

  // Return null if no capsules to summarize
  if (!capsules || capsules.length === 0) {
    return null;
  }

  // Return null if no citations are provided
  // The contract schema requires at least 1 citation
  if (!citations || citations.length === 0) {
    return null;
  }

  // Generate extractive summary text from capsules
  const text = generateCapsuleExtractiveSummary(query, capsules);

  // Build summary object
  const summary = {
    text,
    citations,
  };

  // Validate against contract schema
  return retrievalSummarySchema.parse(summary);
}

/**
 * Build citations from capsule matches.
 *
 * Converts CapsuleMatch[] to RetrievalCitation[] for use in v2 summary generation.
 * Per T-30-02-02: Citations are derived from already-governed CapsuleMatch records
 * to preserve filtering guarantees.
 *
 * @param capsules - The filtered capsule matches to cite
 * @returns Array of RetrievalCitation objects
 */
export function buildCapsuleCitations(capsules: CapsuleMatch[]): RetrievalCitation[] {
  return capsules.map((capsule) => ({
    source: {
      entryId: capsule.capsuleId,
      scope: capsule.scope,
      shortcut: capsule.situation, // Closest analog to shortcut for capsules
    },
    snippet: capsule.content,
    tags: capsule.labels,
    // Use 'semantic' as safe fallback since capsule channel may not be in enum
    recallChannels: ['semantic'] as ['semantic'],
    scores: {
      semantic: null,
      keyword: null,
      graph: null,
      preRerank: capsule.score ?? 0,
      final: capsule.score ?? 0,
    },
  }));
}

/**
 * Generate an extractive summary from capsule hits.
 *
 * This is a deterministic baseline implementation that:
 * - Extracts key information from the provided capsules
 * - Does NOT call any external services
 * - Produces consistent output for the same inputs
 *
 * @param query - The search query (for context)
 * @param capsules - The filtered distilled capsule hits
 * @returns Extractive summary text
 */
function generateCapsuleExtractiveSummary(query: string, capsules: CapsuleMatch[]): string {
  if (capsules.length === 0) {
    return '';
  }

  // For single capsule, return the problem/goal
  if (capsules.length === 1) {
    const capsule = capsules[0];
    if (!capsule) return '';
    return `${capsule.problem}: ${capsule.goal}`;
  }

  // For multiple capsules, create a concise extractive summary
  const parts: string[] = [];

  for (const capsule of capsules) {
    // Add the problem as a bullet point
    parts.push(`• ${capsule.problem}: ${truncateText(capsule.goal, 100)}`);
  }

  return `Found ${capsules.length} relevant capsules:\n${parts.join('\n')}`;
}
