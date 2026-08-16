/**
 * Core-Tier Retrieval Evaluation Datasets
 *
 * Phase 25-02: Wired core dataset exports for both v1 and v2 endpoints.
 *
 * Core tier provides broader coverage for regression detection.
 * Coverage: mode variations, ranking expectations, response shape checks, governance.
 */

import type { RetrievalEvalCase, RetrievalEvalScenario } from '../types/index.js';

// Import v1 and v2 core datasets
import { v1RetrievalCoreCases } from './datasets/core/v1-retrieval-core.js';
import { v2RetrievalCoreCases } from './datasets/core/v2-retrieval-core.js';
import { v3GraphPlanCoreCases } from './datasets/core/v3-graph-plan-core.js';

// Import core scenarios
import {
  coreScenariosMap,
  coreScenarios as scenarios,
} from './scenarios/core/retrieval-core-scenarios.js';

// =============================================================================
// Core-Tier Cases Aggregation
// =============================================================================

/**
 * Core-tier retrieval eval cases.
 *
 * Cases cover:
 * - v1-semantic-ranked-core: Multiple relevant IDs with ideal order
 * - v1-hybrid-ranked-core: Hybrid mode coverage
 * - v1-graph-assisted-ranked-core: Graph-assisted mode parity
 * - v1-bucket-shape-core: globalConstraints vs projectKnowledge split
 * - v1-governance-core: Mixed visibility governance filtering
 * - v2-capsule-ranked-core: Multiple relevant capsule IDs with ideal order
 * - v2-profile-hints-core: Expected profileHints for artifact IDs
 * - v2-governance-core: Disallowed artifact IDs absent while allowed capsules rank
 * - v2-scope-distribution-core: Scope distribution verification in capsules
 */
export const coreCases: RetrievalEvalCase[] = [
  ...v1RetrievalCoreCases,
  ...v2RetrievalCoreCases,
  ...v3GraphPlanCoreCases,
];

/**
 * Core-tier scenarios (fixture state and actor context).
 */
export const coreScenarios: RetrievalEvalScenario[] = scenarios;

/**
 * Core-tier scenarios indexed by scenarioId.
 */
export { coreScenariosMap };
