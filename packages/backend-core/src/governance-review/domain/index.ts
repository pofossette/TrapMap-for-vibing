/**
 * Governance-review bounded context — domain layer.
 *
 * Phase 2 target: pure governance / review decision / remediation /
 * maintenance / decay domain types and policy helpers. Currently the
 * business rules live behind the port seam; this file reserves the
 * pure-domain home for future extraction.
 */

export const GOVERNANCE_REVIEW_CONTEXT = 'governance-review' as const;

export const GOVERNANCE_REVIEW_OWNED_CAPABILITIES = [
  'review-decisions',
  'artifact-review',
  'feedback',
  'maintenance',
  'decay',
] as const;

/**
 * `backend-core` module descriptor shorthand for this context.
 * Kept as `review` for compatibility with the legacy descriptor name
 * used by topology and runtime ownership lookups.
 */
export const GOVERNANCE_REVIEW_SHORTHAND = 'review' as const;
