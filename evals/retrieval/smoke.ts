/**
 * Smoke-Tier Retrieval Evaluation Datasets
 *
 * Phase 25-01: Empty placeholder that supports dry-run validation.
 * Phase 25-02 will populate with real golden dataset cases.
 *
 * Smoke tier provides fast feedback that the evaluation pipeline is wired correctly.
 * Coverage: positive hit, empty result, forbidden result for both v1 and v2 endpoints.
 */

import type { RetrievalEvalCase } from '../../packages/contracts/src/index.js';

/**
 * Smoke-tier retrieval eval cases.
 *
 * Cases in this array should cover:
 * - v1-semantic-positive-smoke: One approved, visible entry in correct bucket
 * - v1-semantic-empty-smoke: No visible/relevant entries returns empty
 * - v1-semantic-forbidden-smoke: Cross-team/high-level/pending entries filtered
 * - v2-capsule-positive-smoke: One eligible capsule with profile hints
 * - v2-capsule-empty-smoke: No eligible artifact/capsule returns empty
 * - v2-capsule-forbidden-smoke: Disallowed state stays absent
 *
 * Phase 25-02 will populate this array with real cases.
 */
export const smokeCases: RetrievalEvalCase[] = [
  // Phase 25-02: Add smoke-tier cases here
];

/**
 * Smoke-tier scenarios (fixture state and actor context).
 *
 * Phase 25-02 may export scenarios separately if cases share fixture state.
 */
export const smokeScenarios = [
  // Phase 25-02: Add scenarios here if needed
];