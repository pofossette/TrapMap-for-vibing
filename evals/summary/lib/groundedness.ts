/**
 * Groundedness scoring module for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module calculates groundedness scores based on claim verification
 * results. Groundedness measures how well summary claims are supported
 * by the retrieved context.
 */

import type { ClaimVerification } from './types.js';

// =============================================================================
// Groundedness Score Calculation
// =============================================================================

/**
 * Calculate groundedness score from claim verifications.
 *
 * The groundedness score is the ratio of supported claims to total claims.
 * A higher score indicates more claims are grounded in the retrieved context.
 *
 * @param claims - Array of claim verification results
 * @returns Groundedness score (0.0 to 1.0)
 */
export function calculateGroundednessScore(claims: ClaimVerification[]): number {
  if (!claims || claims.length === 0) {
    // No claims means nothing to verify, consider it fully grounded
    return 1.0;
  }

  const supportedCount = claims.filter((c) => c.supported).length;
  return supportedCount / claims.length;
}

// =============================================================================
// Unsupported Claims Identification
// =============================================================================

/**
 * Identify claims that are not supported by context.
 *
 * @param claims - Array of claim verification results
 * @returns Array of unsupported claim texts
 */
export function identifyUnsupportedClaims(claims: ClaimVerification[]): string[] {
  if (!claims || claims.length === 0) {
    return [];
  }

  return claims.filter((c) => !c.supported).map((c) => c.text);
}

// =============================================================================
// Groundedness Report Formatting
// =============================================================================

/**
 * Format a human-readable groundedness report.
 *
 * @param claims - Array of claim verification results
 * @returns Human-readable report string
 */
export function formatGroundednessReport(claims: ClaimVerification[]): string {
  if (!claims || claims.length === 0) {
    return 'No claims to verify.';
  }

  const supported = claims.filter((c) => c.supported);
  const unsupported = claims.filter((c) => !c.supported);

  const lines: string[] = [];
  lines.push(`Groundedness Report (${supported.length}/${claims.length} supported)`);

  if (supported.length > 0) {
    lines.push('\nSupported claims:');
    for (const claim of supported) {
      lines.push(`  ✓ ${claim.text}`);
      if (claim.evidence) {
        lines.push(`    Evidence: "${claim.evidence.substring(0, 100)}..."`);
      }
    }
  }

  if (unsupported.length > 0) {
    lines.push('\nUnsupported claims:');
    for (const claim of unsupported) {
      lines.push(`  ✗ ${claim.text}`);
    }
  }

  return lines.join('\n');
}
