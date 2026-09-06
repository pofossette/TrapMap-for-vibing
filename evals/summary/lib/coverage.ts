/**
 * Coverage scoring module for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module calculates coverage scores based on required facts.
 * Coverage measures how well the summary includes required facts
 * from the evaluation case expectations.
 */

// =============================================================================
// Coverage Score Calculation
// =============================================================================

export function checkRequiredFactsCoverage(
  summaryText: string,
  requiredFacts: string[],
): { covered: string[]; missing: string[] } {
  const summaryLower = summaryText.toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];
  for (const fact of requiredFacts) {
    if (summaryLower.includes(fact.toLowerCase())) {
      covered.push(fact);
    } else {
      missing.push(fact);
    }
  }
  return { covered, missing };
}

/**
 * Calculate coverage score from required facts.
 *
 * The coverage score is the ratio of required facts that appear in the summary.
 * A higher score indicates more required information is covered.
 *
 * @param params - Summary text and required facts
 * @returns Coverage score and lists of covered/missing facts
 */
export function calculateCoverageScore(params: { summaryText: string; requiredFacts: string[] }): {
  score: number;
  covered: string[];
  missing: string[];
} {
  const { summaryText, requiredFacts } = params;

  if (!requiredFacts || requiredFacts.length === 0) {
    // No required facts means nothing to cover, consider it fully covered
    return {
      score: 1.0,
      covered: [],
      missing: [],
    };
  }

  const { covered, missing } = checkRequiredFactsCoverage(summaryText, requiredFacts);

  const score = covered.length / requiredFacts.length;

  return { score, covered, missing };
}

// =============================================================================
// Coverage Report Formatting
// =============================================================================

/**
 * Format a human-readable coverage report.
 *
 * @param params - Lists of covered and missing facts
 * @returns Human-readable report string
 */
export function formatCoverageReport(params: { covered: string[]; missing: string[] }): string {
  const { covered, missing } = params;
  const total = covered.length + missing.length;

  if (total === 0) {
    return 'No required facts to check.';
  }

  const lines: string[] = [];
  lines.push(`Coverage Report (${covered.length}/${total} covered)`);

  if (covered.length > 0) {
    lines.push('\nCovered facts:');
    for (const fact of covered) {
      lines.push(`  ✓ ${fact}`);
    }
  }

  if (missing.length > 0) {
    lines.push('\nMissing facts:');
    for (const fact of missing) {
      lines.push(`  ✗ ${fact}`);
    }
  }

  return lines.join('\n');
}
