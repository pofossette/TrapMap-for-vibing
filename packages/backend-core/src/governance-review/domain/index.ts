/**
 * Governance-review bounded context — domain layer.
 *
 * Pure governance / review decision / remediation / feedback / conflict
 * rules with zero framework, DB or I/O imports. The service application
 * layer renders these into orchestration; the PostgreSQL owner uses them
 * for remediation projections and queue eligibility.
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

export * from './conflict.js';
export * from './invariants.js';
export * from './policy.js';
export * from './review-queue-query.js';
