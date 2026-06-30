import type {
  AgentPlanningDeterministicPrecheck,
  AgentPlanningEvalCase,
  AgentPlanningJudgeResult,
} from '@trapmap/contracts/evals';

import { normalizeActorOutput } from './normalizer.js';

export interface JudgeRunInput {
  caseDefinition: AgentPlanningEvalCase;
  actorOutput: string;
  deterministicPrecheck: AgentPlanningDeterministicPrecheck;
}

function includesStep(haystacks: string[], needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase();
  return haystacks.some((item) => item.toLowerCase().includes(normalizedNeedle));
}

export function runJudge(input: JudgeRunInput): AgentPlanningJudgeResult {
  const normalized = normalizeActorOutput(input.actorOutput);
  const matchedKeyActions = input.caseDefinition.goldenPath.keyActions.filter((step) =>
    includesStep(normalized.normalizedPlan, step),
  );
  const missingKeyActions = input.caseDefinition.goldenPath.keyActions.filter(
    (step) => !matchedKeyActions.includes(step),
  );
  const pathScore = input.caseDefinition.goldenPath.requiredSteps.reduce((score, step) => {
    return (
      score +
      (includesStep(normalized.normalizedPlan, step)
        ? (input.caseDefinition.goldenPath.stepWeights[step] ?? 0)
        : 0)
    );
  }, 0);
  const finalAnswerScore =
    input.actorOutput.includes(input.caseDefinition.expectedOutcome.finalAnswer) ||
    input.caseDefinition.expectedOutcome.successCriteria.every((criterion) =>
      input.actorOutput.toLowerCase().includes(criterion.toLowerCase()),
    )
      ? 1
      : 0.5;
  const dimensionScores = input.caseDefinition.judgeRubric.dimensions.map((dimension) => {
    const score = dimension.id === 'path-correctness' ? pathScore : finalAnswerScore;

    return {
      dimensionId: dimension.id,
      score,
      rationale:
        dimension.id === 'path-correctness'
          ? `Matched ${matchedKeyActions.length}/${input.caseDefinition.goldenPath.keyActions.length} key actions.`
          : finalAnswerScore === 1
            ? 'Final answer satisfied the expected outcome.'
            : 'Final answer only partially satisfied the expected outcome.',
    };
  });
  const totalScore = dimensionScores.reduce((sum, dimensionScore) => {
    const dimension = input.caseDefinition.judgeRubric.dimensions.find(
      (candidate) => candidate.id === dimensionScore.dimensionId,
    );
    return sum + dimensionScore.score * (dimension?.weight ?? 0);
  }, 0);

  return {
    totalScore: Number(totalScore.toFixed(4)),
    pathScore: Number(pathScore.toFixed(4)),
    finalAnswerScore,
    dimensionScores,
    matchedKeyActions,
    missingKeyActions,
    forbiddenActionHits: input.deterministicPrecheck.forbiddenActionHits,
    summary: input.deterministicPrecheck.passed
      ? 'Plan satisfied deterministic prechecks.'
      : 'Plan missed deterministic precheck requirements.',
  };
}
