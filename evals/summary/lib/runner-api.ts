/**
 * Case-loading API for the summary evaluation runner.
 *
 * Phase 28-01: EOPS-01
 *
 * The native programmatic execution loop (`runSummaryEvaluation`) was removed
 * in the promptfoo cutover; execution now runs exclusively through the
 * `summaryBridge` (see `evals/promptfoo/runner.ts`). This module keeps the
 * case-loading helpers that the bridge and platform-event mirroring consume.
 */

import {
  type SummaryEvalCase,
  type SummaryEvalEndpoint,
  type SummaryEvalTier,
  summaryEvalCaseSchema,
} from '@trapmap/contracts/evals';
import type { SummaryEvalReport } from '../../../packages/contracts/src/domain/evals/report.js';

import { summaryCoreCases } from '../core.js';
import { summarySmokeCases } from '../smoke.js';
import type { JudgeProvider } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface RunSummaryOptions {
  tier: SummaryEvalTier;
  dryRun?: boolean;
  allowEmpty?: boolean;
  endpoint?: SummaryEvalEndpoint;
  verbose?: number;
  provider?: JudgeProvider;
}

export interface RunSummaryResult {
  passed: boolean;
  report: SummaryEvalReport | null;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    avgGroundedness: number;
    avgCoverage: number;
    forbiddenClaimHits: number;
  };
  durationMs: number;
}

// =============================================================================
// Case Loading
// =============================================================================

/**
 * Load cases for the specified tier.
 */
function loadCasesForTier(tier: SummaryEvalTier): SummaryEvalCase[] {
  const rawCases = tier === 'smoke' ? summarySmokeCases : summaryCoreCases;

  const validatedCases: SummaryEvalCase[] = [];
  for (const rawCase of rawCases) {
    try {
      const parsed = summaryEvalCaseSchema.parse(rawCase);
      validatedCases.push(parsed);
    } catch (error) {
      console.error(`Invalid case in ${tier} tier:`, error);
      throw error;
    }
  }

  return validatedCases;
}

/**
 * Filter cases by endpoint if specified.
 */
function filterCasesByEndpoint(
  cases_: SummaryEvalCase[],
  endpoint?: SummaryEvalEndpoint,
): SummaryEvalCase[] {
  if (!endpoint) return cases_;
  return cases_.filter((c) => c.endpoint === endpoint);
}

export function getSummaryEvaluationCases(
  tier: SummaryEvalTier,
  endpoint?: SummaryEvalEndpoint,
): SummaryEvalCase[] {
  return filterCasesByEndpoint(loadCasesForTier(tier), endpoint);
}

export function getSummaryScenarioIds(
  tier: SummaryEvalTier,
  endpoint?: SummaryEvalEndpoint,
): string[] {
  return [
    ...new Set(getSummaryEvaluationCases(tier, endpoint).map((case_) => case_.scenarioId)),
  ].sort();
}
