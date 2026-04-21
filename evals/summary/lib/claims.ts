/**
 * Claims extraction module for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module implements extractive claims extraction from summary text.
 * The approach splits summaries into atomic claims that can be verified
 * against retrieved context for groundedness scoring.
 *
 * Key design:
 * - Claims are atomic assertions extracted from summary sentences
 * - Citation references are preserved for traceability
 * - Simplified claim matching enables fuzzy comparison with context
 */

import type { ExtractedClaim } from './types.js';

// =============================================================================
// Claims Extraction
// =============================================================================

/**
 * Extract atomic claims from summary text.
 *
 * The extraction approach:
 * 1. Split text into sentences using punctuation boundaries
 * 2. Clean each sentence of leading/trailing whitespace
 * 3. Skip empty sentences
 * 4. Identify citation references for traceability
 *
 * @param summaryText - The summary text to extract claims from
 * @returns Array of extracted claims
 */
export function extractClaims(summaryText: string): ExtractedClaim[] {
  if (!summaryText || typeof summaryText !== 'string') {
    return [];
  }

  const claims: ExtractedClaim[] = [];

  // Split by sentence-ending punctuation
  const sentences = summaryText.split(/[.!?]+/g);

  for (const sentence of sentences) {
    // Clean and validate
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // Extract citation references like [1], [citation:xxx], [source:xxx]
    const citationMatch = trimmed.match(/\[(\d+|citation:[^\]]+|source:[^\]]+)\]/);

    const claim: ExtractedClaim = {
      text: trimmed,
    };

    if (citationMatch) {
      claim.citationId = citationMatch[1] ?? undefined;
    }

    claims.push(claim);
  }

  return claims;
}

/**
 * Extract claims from a summary object with citations.
 *
 * @param summary - Summary object with text and citations
 * @returns Array of extracted claims with mapped citation IDs
 */
export function extractClaimsFromSummary(summary: {
  text: string;
  citations?: Array<{ source: { entryId: string } }>;
}): ExtractedClaim[] {
  const claims = extractClaims(summary.text);

  // Map citation references to entry IDs if available
  if (summary.citations && summary.citations.length > 0) {
    return claims.map((claim, index) => {
      // Match citation indices to entry IDs
      const citationMatch = claim.text.match(/\[(\d+)\]/);
      if (citationMatch) {
        const citationIndex = parseInt(citationMatch[1] ?? '0', 10) - 1;
        if (citationIndex >= 0 && citationIndex < (summary.citations?.length ?? 0)) {
          return {
            ...claim,
            citationId: summary.citations![citationIndex]!.source.entryId,
          };
        }
      }
      return claim;
    });
  }

  return claims;
}

// =============================================================================
// Claim Simplification
// =============================================================================

/**
 * Simplify a claim for fuzzy matching against context.
 *
 * The simplification approach:
 * 1. Convert to lowercase for case-insensitive matching
 * 2. Remove articles (a, an, the) for semantic matching
 * 3. Remove punctuation except alphanumerics and spaces
 * 4. Normalize whitespace
 *
 * @param claim - The claim text to simplify
 * @returns Simplified claim text for matching
 */
export function simplifyClaim(claim: string): string {
  if (!claim || typeof claim !== 'string') {
    return '';
  }

  // Lowercase
  let simplified = claim.toLowerCase();

  // Remove articles (word boundaries to avoid partial matches)
  simplified = simplified.replace(/\b(a|an|the)\b/g, '');

  // Remove punctuation except alphanumerics and spaces
  simplified = simplified.replace(/[^a-z0-9\s]/g, ' ');

  // Normalize whitespace
  simplified = simplified.replace(/\s+/g, ' ').trim();

  return simplified;
}
