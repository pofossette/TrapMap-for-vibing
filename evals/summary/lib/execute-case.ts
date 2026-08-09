/**
 * Shared per-case execution for summary evaluation.
 *
 * Runs one `SummaryEvalCase` through the real retrieval route with seeded
 * fixtures, extracts the summary + context trace from the response, then grades
 * it with the configured judge. Shared by the native runner and the promptfoo
 * bridge so `--runner promptfoo` is per-case identical to native.
 */

import type { RetrievalEvalScenario, SummaryEvalCase } from '@trapmap/contracts/evals';

import {
  type ExecutionContext as RetrievalExecutionContext,
  closeExecutionContext,
  createActorSession,
  createExecutionContext as createRetrievalContext,
  executeThroughRoute,
  seedScenarioFixtures,
} from '../../retrieval/lib/adapters.js';
import { summaryCoreScenariosMap } from '../scenarios/core/summary-core-scenarios.js';
import { summarySmokeScenariosMap } from '../scenarios/smoke/summary-smoke-scenarios.js';
import { evaluateSummaryVerdicts } from './assertions.js';
import { createJudge, fallbackJudge } from './judge.js';
import type { JudgeProvider, SummaryCaseResult } from './types.js';

export interface ExecuteSummaryCaseOptions {
  provider: JudgeProvider;
  verbose?: number;
}

function loadSummaryScenario(scenarioId: string): RetrievalEvalScenario | undefined {
  return summaryCoreScenariosMap[scenarioId] ?? summarySmokeScenariosMap[scenarioId];
}

/**
 * Execute a single summary evaluation case.
 */
export async function executeSummaryCase(
  case_: SummaryEvalCase,
  options: ExecuteSummaryCaseOptions,
): Promise<SummaryCaseResult> {
  const startTime = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];

  const retrievalCtx: RetrievalExecutionContext = await createRetrievalContext();

  try {
    const scenario = loadSummaryScenario(case_.scenarioId);

    if (!scenario) {
      warnings.push({
        code: 'scenario-not-found',
        message: `Scenario not found: ${case_.scenarioId}`,
      });

      const judgeResult = fallbackJudge({
        summaryText: '',
        context: [],
        requiredFacts: case_.expected.requiredFacts,
        forbiddenClaims: case_.expected.forbiddenClaims,
      });

      return {
        case: case_,
        judgeResult,
        passed: false,
        durationMs: Date.now() - startTime,
        warnings,
        rawResponse: null,
        contextTrace: [],
        summaryText: null,
      };
    }

    const retrievalCase = {
      scenarioId: case_.scenarioId,
      endpoint: case_.endpoint,
      request: case_.request,
    };

    await seedScenarioFixtures(retrievalCtx, retrievalCase, scenario);

    await createActorSession(retrievalCtx, scenario.actor);

    const adapterResult = await executeThroughRoute(retrievalCtx, retrievalCase as any);

    const rawResponse = adapterResult.result.rawResponse;
    const rawResp = rawResponse as Record<string, unknown>;
    const summaryText: string | null =
      (rawResp?.summary as { text?: string } | undefined)?.text ?? null;

    let contextTrace: string[] = [];

    if (case_.endpoint === '/v1/retrieval/search') {
      const globalConstraints = (rawResp?.globalConstraints ?? []) as Array<{
        detail?: string;
      }>;
      const projectKnowledge = (rawResp?.projectKnowledge ?? []) as Array<{ detail?: string }>;

      contextTrace = [
        ...globalConstraints.map((entry) => entry?.detail ?? '').filter(Boolean),
        ...projectKnowledge.map((entry) => entry?.detail ?? '').filter(Boolean),
      ];
    } else {
      const capsules = (rawResp?.capsules ?? []) as Array<{
        content?: string;
        problem?: string;
        goal?: string;
      }>;

      contextTrace = capsules
        .map((capsule) =>
          `${capsule?.content ?? ''} ${capsule?.problem ?? ''} ${capsule?.goal ?? ''}`.trim(),
        )
        .filter(Boolean);
    }

    const judge = createJudge({ provider: options.provider });
    const judgeResult = await judge.evaluate(summaryText ?? '', contextTrace, {
      requiredFacts: case_.expected.requiredFacts,
      forbiddenClaims: case_.expected.forbiddenClaims,
    });

    const { passed } = evaluateSummaryVerdicts({
      case_,
      judgeResult,
    });

    const durationMs = Date.now() - startTime;

    if (options.verbose && options.verbose > 0) {
      console.log(
        `  ${case_.caseId}: ${passed ? 'PASS' : 'FAIL'} (G=${judgeResult.groundednessScore.toFixed(2)}, C=${judgeResult.coverageScore.toFixed(2)})`,
      );
    }

    return {
      case: case_,
      judgeResult,
      passed,
      durationMs,
      warnings,
      rawResponse,
      contextTrace,
      summaryText,
    };
  } finally {
    await closeExecutionContext(retrievalCtx);
  }
}
