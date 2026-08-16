/**
 * Case-loading API for the retrieval evaluation runner.
 *
 * Phase 28-01: EOPS-01
 *
 * The native programmatic execution loop (`runRetrievalEvaluation`) was removed
 * in the promptfoo cutover; execution now runs exclusively through the
 * `retrievalBridge` (see `evals/promptfoo/runner.ts`). This module keeps the
 * case-loading helpers that the bridge and platform-event mirroring consume.
 */

import type { RetrievalEvalCase, RetrievalEvalTier } from '../../types/index.js';

import { filterByEndpoint, loadCases } from './load.js';

// =============================================================================
// Types
// =============================================================================

export interface RunRetrievalOptions {
  tier: RetrievalEvalTier;
  dryRun?: boolean;
  allowEmpty?: boolean;
  endpoint?:
    | '/v1/retrieval/search'
    | '/v1/retrieval/skills/search-by-content'
    | '/v2/retrieval/search'
    | '/v3/retrieval/search';
  verbose?: number;
}

export function getRetrievalEvaluationCases(
  tier: RetrievalEvalTier,
  endpoint?: RunRetrievalOptions['endpoint'],
): RetrievalEvalCase[] {
  const cases_ = loadCases(tier);
  return filterByEndpoint(cases_, endpoint);
}

export function getRetrievalScenarioIds(
  tier: RetrievalEvalTier,
  endpoint?: RunRetrievalOptions['endpoint'],
): string[] {
  return [
    ...new Set(getRetrievalEvaluationCases(tier, endpoint).map((case_) => case_.scenarioId)),
  ].sort();
}
