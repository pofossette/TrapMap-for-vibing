/**
 * Shared per-case execution for retrieval evaluation.
 *
 * Runs one `RetrievalEvalCase` through the isolated context lifecycle
 * (create → seed fixtures → execute route → close) and evaluates governance,
 * ranking metrics, graph-plan structure and outcome match. Shared by the native
 * runner and the promptfoo bridge so `--runner promptfoo` is per-case identical
 * to native.
 */

import type { RetrievalEvalCase } from '../../types/index.js';

import {
  closeExecutionContext,
  createExecutionContext,
  executeCase,
  seedScenarioFixtures,
} from './adapters.js';
import { assertGraphPlanStructure } from './assertions.js';
import { evaluateGovernance } from './governance.js';
import { calculateMetrics } from './metrics.js';
import type { CaseResult } from './types.js';

export async function executeRetrievalCase(case_: RetrievalEvalCase): Promise<CaseResult> {
  const ctx = await createExecutionContext();

  try {
    await seedScenarioFixtures(ctx, case_);
    const adapterResult = await executeCase(ctx, case_);

    const governance = evaluateGovernance(case_, adapterResult.result);
    const metrics = calculateMetrics(
      adapterResult.result,
      case_.expected.relevance.relevantIds,
      case_.expected.relevance.idealOrder,
    );

    const graphPlanResult =
      case_.endpoint === '/v3/retrieval/search' && case_.expected.shape.graphPlanExpectations
        ? assertGraphPlanStructure(
            adapterResult.result.graphPlanStructure,
            case_.expected.shape.graphPlanExpectations,
          )
        : undefined;

    const outcomeMatch =
      (case_.expected.outcome === 'empty' && adapterResult.result.isEmpty) ||
      (case_.expected.outcome === 'non-empty' && !adapterResult.result.isEmpty);
    const graphPlanPassed = !graphPlanResult || graphPlanResult.passed;
    const passed = governance.passed && outcomeMatch && graphPlanPassed;

    return {
      case: case_,
      result: adapterResult.result,
      execution: adapterResult.execution,
      governance,
      metrics,
      passed,
      warnings: adapterResult.warnings,
      ...(graphPlanResult !== undefined ? { graphPlanResult } : {}),
    };
  } finally {
    await closeExecutionContext(ctx);
  }
}
