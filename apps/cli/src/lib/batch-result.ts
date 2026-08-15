/**
 * Batch result formatting helpers.
 *
 * Consolidates the header block that was duplicated across
 * decay, feedback-admin, and maintenance command formatters.
 */
export interface BatchResultSummary {
  dryRun: boolean;
  action: string;
  totalEligible: number;
  totalIneligible: number;
  appliedAt?: string | null;
}

/**
 * Format the common header lines for batch operation results.
 *
 * Returns mutable lines array so callers can push their own
 * data-model-specific item lines and then `join('\n')`.
 */
export function formatBatchResultHeader(data: BatchResultSummary): string[] {
  const lines: string[] = [];
  const mode = data.dryRun ? 'DRY RUN - ' : '';
  lines.push(`${mode}Action: ${data.action}`);
  lines.push(`Eligible: ${data.totalEligible}, Ineligible: ${data.totalIneligible}`);
  if (data.appliedAt != null) {
    lines.push(`Applied at: ${data.appliedAt}`);
  }
  lines.push('');
  return lines;
}
