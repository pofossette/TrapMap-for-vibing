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

  // Skill identification dimension scores
  const lowerPlan = normalized.normalizedPlan.map((s) => s.toLowerCase());
  const lowerOutput = input.actorOutput.toLowerCase();

  // skill_selection_correctness
  const expectedSkillIds = input.caseDefinition.expectedSkillIds ?? [];
  const expectedHits = expectedSkillIds.filter(
    (id) =>
      lowerPlan.some((step) => step.includes(id.toLowerCase())) ||
      lowerOutput.includes(id.toLowerCase()),
  );
  const selectionScore =
    expectedSkillIds.length === 0
      ? undefined
      : expectedHits.length === expectedSkillIds.length
        ? 1.0
        : expectedHits.length > 0
          ? 0.5
          : 0;

  // distractor_rejection
  const distractorIds = input.caseDefinition.expectedDistractorSkillIds ?? [];
  const distractorHits = distractorIds.filter(
    (id) =>
      lowerPlan.some((step) => step.includes(id.toLowerCase())) ||
      lowerOutput.includes(id.toLowerCase()),
  );
  const rejectionScore =
    distractorIds.length === 0
      ? undefined
      : distractorHits.length === 0
        ? 1.0
        : distractorHits.length === 1
          ? 0.5
          : 0;

  // capsule_signal_usage (only for capsule-match-set)
  const capsuleKeywords = ['situation', 'problem', 'goal', 'capsule'];
  const signalHits = capsuleKeywords.filter((kw) => lowerPlan.some((step) => step.includes(kw)));
  const capsuleScore =
    input.caseDefinition.contextSetKind === 'capsule-match-set'
      ? signalHits.length >= 2
        ? 1.0
        : signalHits.length === 1
          ? 0.5
          : 0
      : undefined;

  const dimensionScores = input.caseDefinition.judgeRubric.dimensions.map((dimension) => {
    let score: number;
    let rationale: string;

    switch (dimension.id) {
      case 'path-correctness':
        score = pathScore;
        rationale = `Matched ${matchedKeyActions.length}/${input.caseDefinition.goldenPath.keyActions.length} key actions.`;
        break;
      case 'skill_selection_correctness':
        score = selectionScore ?? finalAnswerScore;
        rationale =
          selectionScore !== undefined
            ? `Hit ${expectedHits.length}/${expectedSkillIds.length} expected skills.`
            : 'No expected skill IDs configured.';
        break;
      case 'distractor_rejection':
        score = rejectionScore ?? finalAnswerScore;
        rationale =
          rejectionScore !== undefined
            ? `Distractor hits: ${distractorHits.length}/${distractorIds.length}.`
            : 'No distractor skill IDs configured.';
        break;
      case 'capsule_signal_usage':
        score = capsuleScore ?? finalAnswerScore;
        rationale =
          capsuleScore !== undefined
            ? `Capsule signals used: ${signalHits.length}/4.`
            : 'Not a capsule-match-set case.';
        break;
      default:
        score = finalAnswerScore;
        rationale =
          finalAnswerScore === 1
            ? 'Final answer satisfied the expected outcome.'
            : 'Final answer only partially satisfied the expected outcome.';
        break;
    }

    return { dimensionId: dimension.id, score, rationale };
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
