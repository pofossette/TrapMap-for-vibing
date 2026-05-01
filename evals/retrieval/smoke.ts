/**
 * Smoke-Tier Retrieval Evaluation Datasets
 *
 * Phase 25-02: Wired smoke dataset exports for both v1 and v2 endpoints.
 *
 * Smoke tier provides fast feedback that the evaluation pipeline is wired correctly.
 * Coverage: positive hit, empty result, forbidden result for both v1 and v2 endpoints.
 */

import type { RetrievalEvalCase, RetrievalEvalScenario } from '@trapmap/contracts';

// Import v1 and v2 smoke datasets
import { v1RetrievalSmokeCases } from './datasets/smoke/v1-retrieval-smoke.js';
import { v2RetrievalSmokeCases } from './datasets/smoke/v2-retrieval-smoke.js';
import { v3GraphPlanSmokeCases } from './datasets/smoke/v3-graph-plan-smoke.js';

// Import smoke scenarios
import {
  smokeScenarios as scenarios,
  smokeScenariosMap,
} from './scenarios/smoke/retrieval-smoke-scenarios.js';

// =============================================================================
// Smoke-Tier Cases Aggregation
// =============================================================================

/**
 * Smoke-tier retrieval eval cases.
 *
 * Cases cover:
 * - v1-semantic-positive-smoke: One approved, visible entry in correct bucket
 * - v1-semantic-empty-smoke: No visible/relevant entries returns empty
 * - v1-semantic-forbidden-smoke: Cross-team/high-level/pending entries filtered
 * - v2-capsule-positive-smoke: One eligible capsule with profile hints
 * - v2-capsule-empty-smoke: No eligible artifact/capsule returns empty
 * - v2-capsule-forbidden-smoke: Disallowed state stays absent
 */
export const smokeCases: RetrievalEvalCase[] = [
  ...v1RetrievalSmokeCases,
  ...v2RetrievalSmokeCases,
  ...v3GraphPlanSmokeCases,
];

/**
 * Smoke-tier scenarios (fixture state and actor context).
 */
export const smokeScenarios: RetrievalEvalScenario[] = scenarios;

/**
 * Smoke-tier scenarios indexed by scenarioId.
 */
export { smokeScenariosMap };
