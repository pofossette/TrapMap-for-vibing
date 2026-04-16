/**
 * Summary builder for retrieval results.
 *
 * This module provides:
 * - Building optional summaries from filtered retrieval hits
 * - Generating extractive summaries from hit content
 * - Including citations with summary output
 *
 * Security note: Summary builder only consumes already-filtered hits
 * and citations from the orchestrator. It never bypasses auth or
 * retrieves additional data from the store. This is a pure function
 * with no external dependencies (no store, recall adapters, or graph index).
 *
 * Per threat model T-10-07: Summary Builder is designed as a pure function
 * that only accepts safe hits/citations from the orchestrator.
 */

import type { RetrievalCitation, RetrievalSummary } from '@skill-shareer/contracts';
import { retrievalSummarySchema } from '@skill-shareer/contracts';

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

  return text.slice(0, maxLength) + '...';
}
