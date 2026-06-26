/**
 * Governance-review bounded context.
 *
 * Owns review decisions, governance eligibility flows, feedback,
 * remediation and operator-facing maintenance / decay commands. Final
 * knowledge aggregate mutations are delegated to knowledge-write.
 */

export * from './application/index.js';
export * from './domain/index.js';
