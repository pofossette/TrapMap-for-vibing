/**
 * Core-Tier Retrieval Evaluation Datasets
 *
 * Phase 25-01: Empty placeholder that supports dry-run validation.
 * Phase 25-02 will populate with real golden dataset cases.
 *
 * Core tier provides broader coverage for regression detection.
 * Coverage: mode variations, ranking expectations, response shape checks.
 */

import type { RetrievalEvalCase } from '../../packages/contracts/src/index.js';

/**
 * Core-tier retrieval eval cases.
 *
 * Cases in this array should cover:
 * - v1-semantic-ranked-core: Multiple relevant IDs with ideal order
 * - v1-hybrid-ranked-core: Hybrid mode coverage
 * - v1-graph-assisted-ranked-core: Graph-assisted mode parity
 * - v1-bucket-shape-core: globalConstraints vs projectKnowledge split
 * - v2-capsule-ranked-core: Multiple relevant capsule IDs with ideal order
 * - v2-profile-hints-core: Expected profileHints for artifact IDs
 * - v2-governance-core: Disallowed artifact IDs absent while allowed capsules rank
 *
 * Phase 25-02 will populate this array with real cases.
 */
export const coreCases: RetrievalEvalCase[] = [
  // Phase 25-02: Add core-tier cases here
];

/**
 * Core-tier scenarios (fixture state and actor context).
 *
 * Phase 25-02 may export scenarios separately if cases share fixture state.
 */
export const coreScenarios = [
  // Phase 25-02: Add scenarios here if needed
];